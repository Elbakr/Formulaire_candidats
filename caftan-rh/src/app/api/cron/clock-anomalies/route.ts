// GET /api/cron/clock-anomalies — détection oublis de clock-out, durées
// anormalement longues, etc. Marque `is_anomalous=true`.
//
// Auth : Bearer CRON_SECRET. Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_OPEN_HOURS = 14;     // une "session" ouverte > 14h = anormale
const FORGOT_OUT_HOURS = 24;   // un clock-in ouvert depuis > 24h = oubli

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();

  // 1) Pour chaque clock-in ouvert (vue clock_currently_in), si > FORGOT_OUT_HOURS
  //    on flag l'entrée comme anomalous + on broadcast un message dans le chat.
  const { data: openRaw } = await admin
    .from("clock_currently_in")
    .select(
      "employee_id, last_entry_id, clock_in_at, site_id, full_name, profile_id, site_code",
    );
  type OpenRow = {
    employee_id: string;
    last_entry_id: string;
    clock_in_at: string;
    site_id: string | null;
    full_name: string;
    profile_id: string | null;
    site_code: string | null;
  };
  const open = (openRaw ?? []) as OpenRow[];

  let flagged = 0;
  const messages: Array<{ room_id: string; profile_id: string; body: string }> = [];

  for (const o of open) {
    const ageH = (now - new Date(o.clock_in_at).getTime()) / 3_600_000;
    if (ageH < FORGOT_OUT_HOURS) continue;
    const { error } = await admin
      .from("clock_entries")
      .update({ is_anomalous: true })
      .eq("id", o.last_entry_id)
      .eq("is_anomalous", false);
    if (!error) flagged++;

    if (o.site_id && o.profile_id) {
      const { data: room } = await admin
        .from("chat_rooms")
        .select("id")
        .eq("kind", "site_group")
        .eq("site_id", o.site_id)
        .maybeSingle();
      if (room) {
        messages.push({
          room_id: (room as { id: string }).id,
          profile_id: o.profile_id,
          body: `⚠️ Clock-out oublié — ${o.full_name} est encore "présent·e" depuis ${ageH.toFixed(0)}h.`,
        });
      }
    }
  }

  if (messages.length > 0) {
    await admin.from("chat_messages").insert(
      messages.map((m) => ({
        room_id: m.room_id,
        author_profile_id: m.profile_id,
        body: m.body,
        attachments: [{ kind: "presence_event", action: "anomaly", forgot: true }],
      })),
    );
  }

  // 2) Marque les sessions terminées dont la durée > MAX_OPEN_HOURS comme anomalous.
  //    On utilise la vue clock_sessions pour les durées.
  const { data: longSessions } = await admin
    .from("clock_sessions")
    .select("in_entry_id, duration_minutes")
    .not("clock_out_at", "is", null)
    .gt("duration_minutes", MAX_OPEN_HOURS * 60);
  type Sess = { in_entry_id: string; duration_minutes: number };
  const longs = (longSessions ?? []) as Sess[];
  let longFlagged = 0;
  if (longs.length > 0) {
    for (const l of longs) {
      const { error } = await admin
        .from("clock_entries")
        .update({ is_anomalous: true })
        .eq("id", l.in_entry_id)
        .eq("is_anomalous", false);
      if (!error) longFlagged++;
    }
  }

  // 3) Karim 2026-06-10 (chantier 2) : JOURS IMPAIRS Tuya = IN ou OUT manquant.
  //    L'alternance IN/OUT se fait par parité chronologique : un nombre IMPAIR
  //    de taps sur une journée close signifie qu'il manque un pointage, donc
  //    la parité (et donc les kinds) du reste de la journée est fausse.
  //    On N'INVERSE RIEN automatiquement (pas de cascade de devinettes) : on
  //    ISOLE le jour (flag is_anomalous) et on notifie la RH pour correction
  //    1-clic (écran chantier 4). Idempotent : on ne traite que les jours dont
  //    aucune entrée n'est encore flaggée -> pas de re-notification.
  // Définition "authoritative" (alignée sur la vue clock_sessions_billing) :
  // on compte les pointages qui font foi pour la clôture d'une journée =
  // tuya + auto_close (fermetures auto) + manual_admin, en EXCLUANT le
  // self-service web (qui ferait doublon). Un jour fermé par auto_close
  // devient pair -> non flaggé (déjà traité par tuya-auto-out).
  const WEB_PATH_SOURCES = ["web", "selfie", "geofence", "mobile", "manual"];
  const ODD_LOOKBACK_DAYS = 7;
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  const oddSince = new Date(now - ODD_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: tuyaRaw } = await admin
    .from("clock_entries")
    .select("id, employee_id, occurred_at, is_anomalous")
    .not("source", "in", `(${WEB_PATH_SOURCES.join(",")})`)
    .gte("occurred_at", oddSince)
    .order("occurred_at", { ascending: true });
  type TuyaEntry = { id: string; employee_id: string; occurred_at: string; is_anomalous: boolean };
  const tuyaEntries = (tuyaRaw ?? []) as TuyaEntry[];

  // Regroupe par (employee_id, jour UTC), en excluant aujourd'hui (jour en cours).
  const dayGroups = new Map<string, { employeeId: string; date: string; ids: string[]; anyFlagged: boolean }>();
  for (const e of tuyaEntries) {
    const date = e.occurred_at.slice(0, 10);
    if (date === todayUtc) continue;
    const key = `${e.employee_id}|${date}`;
    let g = dayGroups.get(key);
    if (!g) { g = { employeeId: e.employee_id, date, ids: [], anyFlagged: false }; dayGroups.set(key, g); }
    g.ids.push(e.id);
    if (e.is_anomalous) g.anyFlagged = true;
  }

  // Jours impairs jamais traités (aucune entrée encore flaggée).
  const oddDays = [...dayGroups.values()].filter((g) => g.ids.length % 2 === 1 && !g.anyFlagged);

  let oddFlagged = 0;
  let oddNotified = 0;
  if (oddDays.length > 0) {
    // Flag toutes les entrées des jours impairs détectés.
    const idsToFlag = oddDays.flatMap((g) => g.ids);
    const { error: flagErr } = await admin
      .from("clock_entries")
      .update({ is_anomalous: true })
      .in("id", idsToFlag);
    if (!flagErr) oddFlagged = idsToFlag.length;

    // Notifie la RH/admin (1 notif par jour impair x destinataire).
    const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
    if (hrIds.length > 0) {
      const empIds = [...new Set(oddDays.map((g) => g.employeeId))];
      const { data: emps } = await admin.from("employees").select("id, full_name").in("id", empIds);
      const nameById = new Map(((emps ?? []) as Array<{ id: string; full_name: string }>).map((e) => [e.id, e.full_name]));
      const notifs = oddDays.flatMap((g) => {
        const name = nameById.get(g.employeeId) ?? "?";
        const count = g.ids.length;
        return hrIds.map((hrId) => ({
          recipient_id: hrId,
          kind: "clock_odd_day",
          title: `Pointage incomplet à corriger : ${name}`,
          body: `${g.date} — ${count} tap(s) Tuya (nombre impair) : il manque un pointage IN ou OUT. Les heures de la journée sont à vérifier.`,
          link: `/planning/employees/${g.employeeId}/prestations?view=day&date=${g.date}`,
          data: { employeeId: g.employeeId, date: g.date, tapCount: count },
        }));
      });
      if (notifs.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(notifs);
        if (!notifErr) oddNotified = oddDays.length;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    open_flagged: flagged,
    long_flagged: longFlagged,
    forgot_messages: messages.length,
    odd_days_flagged: oddFlagged,
    odd_days_notified: oddNotified,
  });
}
