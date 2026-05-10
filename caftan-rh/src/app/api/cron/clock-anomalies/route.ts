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

  return NextResponse.json({
    ok: true,
    open_flagged: flagged,
    long_flagged: longFlagged,
    forgot_messages: messages.length,
  });
}
