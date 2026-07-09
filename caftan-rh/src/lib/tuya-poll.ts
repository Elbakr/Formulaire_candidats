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
//
// Karim 2026-06-16 : logique metier extraite dans processTuyaEvents() pour etre
// reutilisee par tuya-reingest (re-ingestion apres creation d un mapping).

import { createAdminClient } from "@/lib/supabase/server";
import { fetchUnlockLogs, parseUnlockValue, type TuyaUnlockLog } from "@/lib/tuya-client";
import {
  buildEmployeeProfile,
  inferKindCorrection,
  formatCorrectionNote,
} from "@/lib/tuya-correction-inference";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PollResult = {
  ok: boolean;
  error?: string;
  devices_polled: number;
  logs_fetched: number;
  entries_inserted: number;
  skipped_no_mapping: number;
  skipped_duplicate: number;
  errors: string[];
};

export type DeviceRow = {
  tuya_device_id: string;
  tuya_device_name: string | null;
  site_id: string | null;
  fallback_for_site_ids: string[] | null;
};

export type MappingRow = {
  id: string;
  tuya_device_id: string | null;
  tuya_user_id: string | null;
  tuya_user_id_alpha: string | null;
  employee_id: string;
  direction: "in" | "out";
  is_active: boolean;
};

/**
 * Traite une liste d'unlock events pour UN device et les insere dans
 * clock_entries. Logique metier partagee entre pollTuyaLogs et
 * reingestTuyaWindow (tuya-reingest).
 *
 * @returns { inserted, skipped_no_mapping, skipped_duplicate, errors }
 */
export async function processTuyaEvents(
  logs: TuyaUnlockLog[],
  dev: DeviceRow,
  mappings: MappingRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
): Promise<{ inserted: number; skipped_no_mapping: number; skipped_duplicate: number; errors: string[] }> {
  const result = { inserted: 0, skipped_no_mapping: 0, skipped_duplicate: 0, errors: [] as string[] };
  if (logs.length === 0) return result;

  const deviceSiteId = dev.site_id ?? dev.fallback_for_site_ids?.[0] ?? null;
  const fallbackSet = new Set(dev.fallback_for_site_ids ?? []);

  // Trie les logs par ordre chronologique CROISSANT pour l alternance auto
  const sortedLogs = [...logs].sort((a, b) => a.event_time - b.event_time);

  for (const log of sortedLogs) {
    try {
      const parsed = parseUnlockValue(log.value, log.code);
      const userIdLocal = parsed.user_id_in_device != null
        ? String(parsed.user_id_in_device)
        : null;
      if (!userIdLocal) {
        result.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: log ${log.event_time} value indecodable`);
        continue;
      }

      // Cherche un mapping pour ce (device, tuya_user_id).
      const mapping = mappings.find(
        (m) => m.tuya_device_id === dev.tuya_device_id && m.tuya_user_id === userIdLocal,
      );
      if (!mapping) {
        // Signale les slots alpha-only en attente de rapprochement manuel.
        const alphaOnlyForDevice = mappings.filter(
          (m) => m.tuya_device_id === dev.tuya_device_id
            && m.tuya_user_id == null
            && m.tuya_user_id_alpha != null,
        );
        if (alphaOnlyForDevice.length > 0) {
          console.warn(
            `[tuya] Slot ${userIdLocal} non resolu sur ${dev.tuya_device_name ?? dev.tuya_device_id} ` +
              `(${alphaOnlyForDevice.length} mappings alpha-only en attente). ` +
              `Karim doit mapper via /admin/tuya/logs.`,
          );
        }
        // Best-effort : tag l event dans tuya_unmapped_slots.
        // Karim 2026-07-09 : read-modify-write pour PRESERVER first_seen_at et
        // INCREMENTER event_count (l ancien upsert remettait first_seen_at a
        // maintenant et event_count a 1 a chaque passage -> compteur/anteriorite
        // faux). On repasse resolved_at a null si le slot re-devient orphelin.
        try {
          const seenAt = new Date(log.event_time).toISOString();
          const { data: existingSlot } = await supabase
            .from("tuya_unmapped_slots")
            .select("first_seen_at, event_count")
            .eq("tuya_device_id", dev.tuya_device_id)
            .eq("tuya_user_id", userIdLocal)
            .maybeSingle();
          const prev = existingSlot as { first_seen_at: string; event_count: number } | null;
          await supabase
            .from("tuya_unmapped_slots")
            .upsert({
              tuya_device_id: dev.tuya_device_id,
              tuya_user_id: userIdLocal,
              first_seen_at: prev?.first_seen_at ?? seenAt,
              last_seen_at: seenAt,
              event_count: (prev?.event_count ?? 0) + 1,
              resolved_at: null,
            }, { onConflict: "tuya_device_id,tuya_user_id", ignoreDuplicates: false });
        } catch {
          // table optionnelle
        }
        result.skipped_no_mapping++;
        continue;
      }

      // Karim 2026-07-09 : ce slot EST mappe -> on marque l eventuelle ligne
      // tuya_unmapped_slots comme resolue (best-effort, guard resolved_at IS NULL
      // pour ne rien ecrire si deja resolue). Evite les fausses alertes
      // "badge perdu / slot non mappe" (health-check) sur des slots desormais
      // rattaches, et garde la liste des slots vraiment orphelins propre.
      try {
        await supabase
          .from("tuya_unmapped_slots")
          .update({ resolved_at: new Date().toISOString() })
          .eq("tuya_device_id", dev.tuya_device_id)
          .eq("tuya_user_id", userIdLocal)
          .is("resolved_at", null);
      } catch {
        // table optionnelle / non bloquant
      }

      const occurredAt = new Date(log.event_time).toISOString();
      const today = occurredAt.slice(0, 10);

      // DEDUP FAUSSE MANIP : event existant a <2 min -> double lecture.
      const { data: recentEvents } = await supabase
        .from("clock_entries")
        .select("id, occurred_at, kind")
        .eq("employee_id", mapping.employee_id)
        .gte("occurred_at", new Date(log.event_time - 2 * 60_000).toISOString())
        .lte("occurred_at", new Date(log.event_time + 2 * 60_000).toISOString())
        .limit(5);
      if (recentEvents && recentEvents.length > 0) {
        result.skipped_duplicate++;
        continue;
      }

      // TOGGLE PAR ETAT : regarde le dernier tap REEL (source=tuya).
      // session ouverte et recente (< 18h) -> OUT ; sinon -> IN.
      const { data: lastRealRows } = await supabase
        .from("clock_entries")
        .select("id, kind, occurred_at")
        .eq("employee_id", mapping.employee_id)
        .eq("source", "tuya")
        .lt("occurred_at", occurredAt)
        .order("occurred_at", { ascending: false })
        .limit(1);
      const lastReal = (lastRealRows?.[0] ?? null) as { id: string; kind: "in" | "out"; occurred_at: string } | null;
      const realDeltaH = lastReal
        ? (new Date(occurredAt).getTime() - new Date(lastReal.occurred_at).getTime()) / 3600_000
        : Infinity;
      const openInRecent = lastReal?.kind === "in" && realDeltaH < 18;
      const alternanceKind: "in" | "out" = openInRecent ? "out" : "in";

      if (alternanceKind === "out") {
        // Le vrai OUT remplace l'estimation : supprime l'auto-OUT pose entre le
        // IN reel ouvert et maintenant.
        await supabase.from("clock_entries").delete()
          .eq("employee_id", mapping.employee_id)
          .eq("source", "auto_close")
          .gt("occurred_at", lastReal!.occurred_at)
          .lte("occurred_at", occurredAt);
      } else {
        // Nouveau IN : si une session est restee ouverte (oubli/fantome), on la
        // clot AVANT pour eviter le rejet anti-double.
        const { data: lastAnyRows } = await supabase
          .from("clock_entries").select("kind, occurred_at")
          .eq("employee_id", mapping.employee_id)
          .lt("occurred_at", occurredAt)
          .order("occurred_at", { ascending: false }).limit(1);
        const lastAny = (lastAnyRows?.[0] ?? null) as { kind: "in" | "out"; occurred_at: string } | null;
        if (lastAny?.kind === "in") {
          const inMs = new Date(lastAny.occurred_at).getTime();
          const dayEndMs = new Date(lastAny.occurred_at.slice(0, 10) + "T23:00:00Z").getTime();
          const estMs = Math.min(inMs + 3600_000, Math.max(dayEndMs, inMs + 60_000));
          await supabase.from("clock_entries").insert({
            employee_id: mapping.employee_id,
            kind: "out",
            occurred_at: new Date(estMs).toISOString(),
            source: "auto_close",
            auto_clocked_out: true,
            entry_method: "auto_shift",
            notes: "Auto-fermeture session restee ouverte (nouveau badge IN detecte ensuite)",
          });
        }
      }

      // Compteur du jour pour la note de tracabilite uniquement.
      const { count: priorCount } = await supabase
        .from("clock_entries")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", mapping.employee_id)
        .eq("source", "tuya")
        .gte("occurred_at", `${today}T00:00:00Z`)
        .lt("occurred_at", occurredAt);

      // INFERENCE STATISTIQUE pour detecter erreurs de doigt / oublis.
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
      // Garde-fou trigger-safe : on n'insere JAMAIS un OUT sans session ouverte recente.
      if (inferredKind === "out" && !openInRecent) inferredKind = "in";
      const correctionNote = inference.confidence < 100 ? formatCorrectionNote(inference) : null;

      // Site : utilise le shift du jour si l employe travaille sur un site fallback.
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

      // Pre-check tuya_access_log_id pour eviter le trigger prevent_double_clock_in.
      const { data: existing } = await supabase
        .from("clock_entries")
        .select("id")
        .eq("tuya_access_log_id", accessLogId)
        .limit(1);
      if (existing && existing.length > 0) {
        result.skipped_duplicate++;
        continue;
      }

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
          result.skipped_duplicate++;
        } else {
          result.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: insert ${insErr.message}`);
        }
      } else {
        result.inserted++;
        // Notif RH pour les corrections a valider
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
                  ? `Auto-correction appliquee (${inference.confidence}%) : ${empName}`
                  : `Pointage suspect a valider : ${empName}`,
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
      result.errors.push(`${dev.tuya_device_name ?? dev.tuya_device_id}: log error ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

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
    if (logs.length === 0) {
      // Pas de nouveau log : on rafraichit quand meme le heartbeat.
      await supabase.from("tuya_sync_state").upsert({
        id: dev.tuya_device_id,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      continue;
    }

    // Calcule le nouveau max timestamp AVANT de traiter (pour sync_state).
    const maxTs = Math.max(last, ...logs.map((l) => l.event_time));

    // Delègue le traitement événement par événement a processTuyaEvents.
    const evResult = await processTuyaEvents(logs, dev, mappings, supabase);
    out.entries_inserted += evResult.inserted;
    out.skipped_no_mapping += evResult.skipped_no_mapping;
    out.skipped_duplicate += evResult.skipped_duplicate;
    out.errors.push(...evResult.errors);

    // Karim 2026-06-14 : last_sync_at = battement de coeur, mis a jour a
    // chaque passage. last_log_access_time bouge uniquement sur nouveau log.
    if (maxTs > last) {
      await supabase
        .from("tuya_sync_state")
        .upsert({
          id: dev.tuya_device_id,
          last_log_access_time: maxTs,
          last_sync_at: new Date().toISOString(),
          last_error: evResult.errors.length > 0 ? evResult.errors[0] : null,
          updated_at: new Date().toISOString(),
        });
    } else {
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
