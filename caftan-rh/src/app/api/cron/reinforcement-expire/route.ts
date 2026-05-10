import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const nowISO = new Date().toISOString();

  const { data: stale } = await admin
    .from("reinforcement_requests")
    .select(
      `id, requester_profile_id, site_id, date, start_time, end_time,
       proposed_employee_id, expires_at,
       site:sites(code, name)`,
    )
    .eq("status", "sent_to_employee")
    .lt("expires_at", nowISO);

  type Row = {
    id: string;
    requester_profile_id: string | null;
    date: string;
    start_time: string;
    end_time: string;
    proposed_employee_id: string | null;
    expires_at: string;
    site: { code: string; name: string } | null;
  };
  const rows = (stale ?? []) as unknown as Row[];

  let updated = 0;
  for (const r of rows) {
    const { error } = await admin
      .from("reinforcement_requests")
      .update({ status: "expired" })
      .eq("id", r.id)
      .eq("status", "sent_to_employee"); // safety
    if (error) {
      console.error(`[reinforcement-expire] ${r.id} : ${error.message}`);
      continue;
    }
    updated += 1;
    if (r.requester_profile_id) {
      await admin.from("notifications").insert({
        recipient_id: r.requester_profile_id,
        kind: "reinforcement_expired",
        title: "Renfort sans réponse",
        body: `${r.site?.name ?? "Site"} — ${r.date} ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)} : l'employé n'a pas répondu, propose à un autre.`,
        link: `/planning/reinforcement`,
        data: { request_id: r.id },
      });
    }
  }

  return NextResponse.json({ ok: true, expired: updated });
}
