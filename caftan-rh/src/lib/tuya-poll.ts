// Karim 2026-05-24 : polling Tuya - boucle sur les terminaux pointage actifs,
// recupere les unlock events depuis le dernier sync, mappe tuya_user_id ->
// employee_id via tuya_user_mapping, insere dans clock_entries avec
// source='tuya'. Dedupe via tuya_access_log_id unique.
//
// STRATEGIE IN/OUT (Karim 2026-05-24) : on n utilise PLUS mapping.direction.
// A la place, on infere kind par ALTERNANCE chronologique :
//   - 1er pointage de la journee de l employe (entre 04h et 23h59) -> IN
//   - 2eme pointage -> OUT
//   - 3eme pointage -> IN (re-entree apres pause par exemple)
//   - etc.
// Raison : les employes pointent souvent avec une empreinte differente IN vs OUT,
// mais parfois se trompent. La fiabilite est meilleure par ordre que par mapping
// figé direction.
//
// Aucune empreinte ni donnee biometrique ne transite : seul le tuya_user_id
// (numero local opaque) et le timestamp de l unlock event sont utilises.

import { createAdminClient } from "@/lib/supabase/server";
import { fetchUnlockLogs, parseUnlockValue, type TuyaUnlockLog } from "@/lib/tuya-client";
import {
  buildEmployeeProfile,
  inferKindCorrection,
  formatCorrectionNote,
} from "@/lib/tuya-correction-inference";

type PollResult = {
  ok: boolean;
  error?: string;
  devices_polled: number;
  logs_fetched: number;
  entries_inserted: number;
  skipped_no_mapping: number;
  skipped_duplicate: number;
  errors: string[];
};

type DeviceRow = {
  tuya_device_id: string;
  tuya_device_name: string | null;
  site_id: string | null;
  fallback_for_site_ids: string[] | null;
};

type MappingRow = {
  id: string;
  tuya_device_id: string | null;
  tuya_user_id: string | null;
  tuya_user_id_alpha: string | null;
  employee_id: string;
  direction: "in" | "out";
  is_active: boolean;
};

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // 1h
const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours (Tuya retient ~30j)

/**
 * Poll les unlock events Tuya et les insere dans clock_entries.
 *
 * @param options.forceLookbackMs Si specifie, force le start_time a now - lookback,
 *   ignorant le tuya_sync_state.last_log_access_time. Utile pour backfiller
 *   apres avoir cree de nouveaux mappings.
 */
export async function pollTuyaLogs(options?: { forceLookbackMs?: number }): Promise<PollResult> {
  const out: PollResult = {
    ok: true,
    devices_polled: 0,
    logs_fetched: 0,
    entries_inserted: 0,
    skipped_no_mapping: 0,
    skipped_duplicate: 0,
    errors: [],
  };

  const supabase = createAdminClient();

  const { data: devicesRaw, error: devErr } = await supabase
    .from("tuya_devices")
    .select("tuya_device_id, tuya_device_name, site_id, fallback_for_site_ids")
    .eq("is_active", true)
    .eq("is_pointage", true);
  if (devErr) {
    return { ...out, ok: false, error: `load devices: ${devErr.message}` };
  }
  const devices = (devicesRaw ?? []) as DeviceRow[];
  if (devices.length === 0) return out;

  const deviceIds = devices.map((d) => d.tuya_device_id);

  const [{ data: mappingsRaw }, { data: syncRaw }] = await Promise.all([
    supabase
      .from("tuya_user_mapping")
      .select("id, tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, is_active")
      .eq("is_active", true)
      .in("tuya_device_id", deviceIds),
    supabase
      .from("tuya_sync_state")
      .select("id, last_log_access_time")
      .in("id", deviceIds),
  ]);
  const mappings = (mappingsRaw ?? []) as MappingRow[];
  const syncState = new Map(
    ((syncRaw ?? []) as Array<{ id: string; last_log_access_time: number | null }>).map(
      (s) => [s.id, s.last_log_access_time ?? 0],
    ),
  );

  const now = Date.now();

  for (const dev of devices) {
    out.devices_polled++;
    const last = syncState.get(dev.tuya_device_id) ?? 0;
    let since: number;
    if (options?.forceLookbackMs) {
      since = Math.max(now - options.forceLookbackMs, now - MAX_LOOKBACK_MS);
    } else if (last > 0) {
      since = Math.max(last + 1, now - MAX_LOOKBACK_MS);
    } else {
      since = now - DEFAULT_LOOKBACK_MS;
    }

    let logs: TuyaUnlockLog[] = [];
    try {
      logs = await fetchUnlockLogs({
        deviceId: dev.tuya_device_id,
        startTime: since,
        endTime: now,
        size: 50,
      });
    } catch (e) {
      out.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: fetch ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    out.logs_fetched += logs.length;
    if (logs.length === 0) continue;

    let maxTs = last;
    const deviceSiteId = dev.site_id ?? dev.fallback_for_site_ids?.[0] ?? null;
    const fallbackSet = new Set(dev.fallback_for_site_ids ?? []);

    // Trie les logs par ordre chronologique CROISSANT pour l alternance auto
    const sortedLogs = [...logs].sort((a, b) => a.event_time - b.event_time);

    for (const log of sortedLogs) {
      try {
        if (log.event_time > maxTs) maxTs = log.event_time;
        const parsed = parseUnlockValue(log.value, log.code);
        const userIdLocal = parsed.user_id_in_device != null
          ? String(parsed.user_id_in_device)
          : null;
        if (!userIdLocal) {
          out.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: log ${log.event_time} value indecodable`);
          continue;
        }

        // Cherche un mapping pour ce (device, tuya_user_id). On ignore le
        // mapping.direction car on infere kind par alternance chronologique.
        const mapping = mappings.find(
          (m) => m.tuya_device_id === dev.tuya_device_id && m.tuya_user_id === userIdLocal,
        );
        if (!mapping) {
          // Karim 2026-05-24 : on a peut-etre des mappings alpha-only (cas Pointage A
          // ou les 14 empreintes ont ete enrolees par nom Tuya, sans connaitre le
          // slot local). Dans ce cas, on ne peut PAS deduire automatiquement
          // quel alpha correspond a quel slot N (Tuya n expose pas la
          // correspondance via API). Karim doit faire le rapprochement
          // manuellement via /admin/tuya/logs (1 clic par employee, persiste
          // ensuite).
          //
          // Karim 2026-05-26 : on persiste maintenant le slot inconnu dans
          // tuya_unmapped_slots pour qu il soit visible dans /admin/tuya/logs
          // sans avoir a scroller les events.
          const alphaOnlyForDevice = mappings.filter(
            (m) => m.tuya_device_id === dev.tuya_device_id
              && m.tuya_user_id == null
              && m.tuya_user_id_alpha != null,
          );
          if (alphaOnlyForDevice.length > 0) {
            console.warn(
              `[tuya-poll] Slot ${userIdLocal} non resolu sur ${dev.tuya_device_name ?? dev.tuya_device_id} ` +
                `(${alphaOnlyForDevice.length} mappings alpha-only en attente). ` +
                `Karim doit mapper via /admin/tuya/logs.`,
            );
          }
          // Best-effort : tag l event dans tuya_unmapped_slots (si la table existe)
          try {
            await supabase
              .from("tuya_unmapped_slots")
              .upsert({
                tuya_device_id: dev.tuya_device_id,
                tuya_user_id: userIdLocal,
                first_seen_at: new Date(log.event_time).toISOString(),
                last_seen_at: new Date(log.event_time).toISOString(),
                event_count: 1,
              }, { onConflict: "tuya_device_id,tuya_user_id", ignoreDuplicates: false });
          } catch {
            // table optionnelle, n empeche pas le poll
          }
          out.skipped_no_mapping++;
          continue;
        }

        const occurredAt = new Date(log.event_time).toISOString();
        const today = occurredAt.slice(0, 10);

        // Karim 2026-05-26 : DEDUP FAUSSE MANIP. Si un event existe deja pour cet
        // employe a <2 min, c est une double lecture / double-tap empreinte. On
        // ignore le nouvel event pour ne pas creer une fausse paire (cas Omaima
        // 25/05 19:05:34 OUT + 19:05:57 IN qui a casse l alternance et provoque
        // un faux auto-OUT a 19:40).
        const { data: recentEvents } = await supabase
          .from("clock_entries")
          .select("id, occurred_at, kind")
          .eq("employee_id", mapping.employee_id)
          .gte("occurred_at", new Date(log.event_time - 2 * 60_000).toISOString())
          .lte("occurred_at", new Date(log.event_time + 2 * 60_000).toISOString())
          .limit(5);
        if (recentEvents && recentEvents.length > 0) {
          // Au moins un event existant a <2 min -> c est probablement la meme
          // action lue plusieurs fois par le lecteur. On skip.
          out.skipped_duplicate++;
          continue;
        }

        // Karim 2026-06-13 : TOGGLE PAR ETAT (remplace la parite-par-comptage).
        // L'ancienne logique comptait les taps du jour (pair=IN, impair=OUT). Des
        // qu'un tap etait manque (device offline) ou qu'une session etait
        // auto-fermee, la parite DERIVAIT -> le systeme calculait "OUT" sans IN
        // ouvert -> la base rejetait (trigger "impossible de clock-out") -> le
        // VRAI tap etait PERDU. Bug recurrent sur TOUS les sites.
        //
        // Nouvelle regle, auto-cicatrisante, calquee sur le toggle single-empreinte
        // d'Anvers : on regarde le DERNIER pointage de l'employe avant ce tap.
        //   - session OUVERTE et RECENTE (dernier event = IN, < 16h) -> ce tap = OUT
        //   - sinon (dernier = OUT / auto_close, ou IN trop vieux) -> ce tap = IN
        // => on n'insere JAMAIS un OUT sans IN ouvert (zero tap perdu), c'est
        //    robuste aux oublis d'OUT, aux auto-close, et au double-ID (le lookup
        //    est par employee_id, peu importe le tuya_user_id utilise).
        const { data: lastEntryRows } = await supabase
          .from("clock_entries")
          .select("kind, occurred_at")
          .eq("employee_id", mapping.employee_id)
          .lt("occurred_at", occurredAt)
          .order("occurred_at", { ascending: false })
          .limit(1);
        const lastEntry = (lastEntryRows?.[0] ?? null) as { kind: "in" | "out"; occurred_at: string } | null;
        const openInRecent =
          lastEntry?.kind === "in" &&
          new Date(occurredAt).getTime() - new Date(lastEntry.occurred_at).getTime() < 16 * 3600_000;
        const alternanceKind: "in" | "out" = openInRecent ? "out" : "in";
        // Compteur du jour conserve uniquement pour la note de tracabilite.
        const { count: priorCount } = await supabase
          .from("clock_entries")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", mapping.employee_id)
          .eq("source", "tuya")
          .gte("occurred_at", `${today}T00:00:00Z`)
          .lt("occurred_at", occurredAt);

        // Karim 2026-05-26 : INFERENCE STATISTIQUE pour detecter erreurs de doigt
        // / oublis. Charge l historique 15j et le profil de l employe, puis
        // applique inferKindCorrection. Si confiance >= 85%, auto-applique le
        // kind corrige. Sinon, garde le kind original mais flag pour RH.
        const histSince = new Date(log.event_time - 15 * 86400_000).toISOString();
        const { data: hist } = await supabase
          .from("clock_entries")
          .select("kind, occurred_at, source")
          .eq("employee_id", mapping.employee_id)
          .gte("occurred_at", histSince)
          .lte("occurred_at", occurredAt)
          .order("occurred_at", { ascending: true });
        const histRows = (hist ?? []) as Array<{ kind: "in" | "out"; occurred_at: string; source: string | null }>;
        const profile = buildEmployeeProfile(histRows);
        const sameDayEvents = histRows.filter((h) => h.occurred_at.slice(0, 10) === today);
        const inference = inferKindCorrection(
          { kind: alternanceKind, occurred_at: occurredAt },
          profile,
          sameDayEvents,
        );
        let inferredKind = inference.autoApplied ? inference.correctedKind : alternanceKind;
        // Garde-fou trigger-safe : on n'insere JAMAIS un OUT sans session ouverte
        // recente (sinon rejet base = tap perdu). L'inference statistique ne peut
        // donc pas re-casser la parite. Tuya reste source de verite : on garde le tap.
        if (inferredKind === "out" && !openInRecent) inferredKind = "in";
        const correctionNote = inference.confidence < 100 ? formatCorrectionNote(inference) : null;

        // Site : utilise le shift du jour si l employe travaille sur un site fallback
        let siteId = deviceSiteId;
        let shiftId: string | null = null;
        if (mapping.employee_id) {
          const { data: shifts } = await supabase
            .from("shifts")
            .select("id, site_id")
            .eq("employee_id", mapping.employee_id)
            .eq("date", today)
            .limit(1);
          shiftId = shifts?.[0]?.id ?? null;
          const shiftSite = shifts?.[0]?.site_id ?? null;
          if (shiftSite && (fallbackSet.has(shiftSite) || shiftSite === dev.site_id)) {
            siteId = shiftSite;
          }
        }

        const accessLogId = `${dev.tuya_device_id}_${log.event_time}_${userIdLocal}`;

        // Karim 2026-05-24 (agent autonome) : pre-check pour eviter que le
        // trigger prevent_double_clock_in ne fire sur les events deja inseres
        // (le trigger fire AVANT la verif d unicite et retourne check_violation
        // au lieu de 23505). On verifie d abord si l access_log_id existe deja.
        const { data: existing } = await supabase
          .from("clock_entries")
          .select("id")
          .eq("tuya_access_log_id", accessLogId)
          .limit(1);
        if (existing && existing.length > 0) {
          out.skipped_duplicate++;
          continue;
        }

        // Karim 2026-05-26 : notes incluent maintenant l audit de correction
        // pour traçabilite RH (apprentissage et validation a posteriori).
        const baseNote = parsed.method_label
          ? `Tuya ${parsed.method_label} - kind=${inferredKind} (alternance #${(priorCount ?? 0) + 1})`
          : `Tuya - kind=${inferredKind}`;
        const fullNote = correctionNote
          ? `${baseNote} ${correctionNote}`
          : baseNote;

        const { error: insErr } = await supabase.from("clock_entries").insert({
          employee_id: mapping.employee_id,
          shift_id: shiftId,
          site_id: siteId,
          kind: inferredKind,
          occurred_at: occurredAt,
          entry_method: "tap",
          source: "tuya",
          tuya_device_id: dev.tuya_device_id,
          tuya_user_id: userIdLocal,
          tuya_access_log_id: accessLogId,
          notes: fullNote,
        });
        if (insErr) {
          if (insErr.code === "23505" || insErr.message?.includes("duplicate")) {
            out.skipped_duplicate++;
          } else {
            out.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: insert ${insErr.message}`);
          }
        } else {
          out.entries_inserted++;
          // Karim 2026-05-26 : notif RH pour les corrections a valider
          // (confiance < 100% ou requiresHrReview)
          if (inference.requiresHrReview || inference.confidence < 100) {
            try {
              const { data: hrs } = await supabase
                .from("profiles")
                .select("id")
                .in("role", ["admin", "rh"]);
              const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
              if (hrIds.length > 0) {
                const { data: empData } = await supabase
                  .from("employees")
                  .select("full_name")
                  .eq("id", mapping.employee_id)
                  .maybeSingle();
                const empName = (empData as { full_name?: string } | null)?.full_name ?? "?";
                const inserts = hrIds.map((hrId) => ({
                  recipient_id: hrId,
                  kind: "tuya_auto_correction",
                  title: inference.autoApplied
                    ? `Auto-correction appliquée (${inference.confidence}%) : ${empName}`
                    : `Pointage suspect à valider : ${empName}`,
                  body: inference.reason,
                  link: `/planning/employees/${mapping.employee_id}/prestations?view=day&date=${today}`,
                  data: { confidence: inference.confidence, autoApplied: inference.autoApplied, employeeId: mapping.employee_id, occurredAt },
                }));
                await supabase.from("notifications").insert(inserts);
              }
            } catch {
              // notif non bloquante
            }
          }
        }
      } catch (e) {
        out.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: log error ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Karim 2026-06-14 : last_sync_at est un BATTEMENT DE CŒUR (= "le poll a
    // tourné"), mis à jour à CHAQUE passage, même sans nouveau badge. Avant, il
    // n'était écrit que si maxTs > last : pendant les heures creuses (aucun
    // pointage >2h) il vieillissait et faisait crier "crons figés" à tort.
    // last_log_access_time, lui, ne bouge que sur du vrai nouveau log.
    if (maxTs > last) {
      await supabase
        .from("tuya_sync_state")
        .upsert({
          id: dev.tuya_device_id,
          last_log_access_time: maxTs,
          last_sync_at: new Date().toISOString(),
          last_error: out.errors.filter((e) => e.startsWith(dev.tuya_device_name ?? "")).slice(0, 1)[0] ?? null,
          updated_at: new Date().toISOString(),
        });
    } else {
      // Pas de nouveau log : on rafraîchit quand même le heartbeat.
      await supabase
        .from("tuya_sync_state")
        .upsert({
          id: dev.tuya_device_id,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }
  }

  return out;
}
