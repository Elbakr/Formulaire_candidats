// Karim 2026-06-03 : cron quotidien qui alerte sur les formations qui
// expirent dans <60j ou viennent juste d expirer. Notifications admin/RH +
// notification au worker concerné.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date();
  const in60d = new Date(today.getTime() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Formations expirant dans <60j sans rappel récent
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: expiring } = await admin
    .from("training_records")
    .select("id, title, kind, expires_at, employee_id, employee:employees(full_name, profile_id)")
    .lte("expires_at", in60d)
    .gte("expires_at", today.toISOString().slice(0, 10))
    .in("status", ["valid", "expiring_soon"])
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${sevenDaysAgo}`)
    .limit(100);

  let notified = 0;
  const errors: string[] = [];

  for (const t of (expiring ?? []) as Array<{ id: string; title: string; kind: string; expires_at: string; employee_id: string; employee?: { full_name: string; profile_id: string | null } | null }>) {
    try {
      const daysLeft = Math.ceil((new Date(t.expires_at).getTime() - today.getTime()) / (24 * 3600 * 1000));
      // Notif au worker
      if (t.employee?.profile_id) {
        await admin.from("notifications").insert({
          recipient_id: t.employee.profile_id,
          kind: "training_expiring",
          title: `⏰ Formation expire dans ${daysLeft}j`,
          body: `Ta formation "${t.title}" expire le ${t.expires_at}. Pense à la renouveler.`,
          link: `/me/profile`,
          data: { trainingId: t.id, daysLeft },
        });
      }
      // Notif admin/rh
      const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
      const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
      if (hrIds.length > 0) {
        await admin.from("notifications").insert(
          hrIds.map((hrId) => ({
            recipient_id: hrId,
            kind: "training_expiring_hr",
            title: `⏰ ${t.employee?.full_name ?? "—"} : formation expire`,
            body: `"${t.title}" expire dans ${daysLeft}j (le ${t.expires_at})`,
            link: `/rh/trainings?status=expiring_soon`,
            data: { trainingId: t.id, daysLeft, employeeId: t.employee_id },
          })),
        );
      }
      await admin.from("training_records").update({ last_reminder_at: new Date().toISOString() }).eq("id", t.id);
      notified++;
    } catch (e) {
      errors.push(`${t.id}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, notified, errors: errors.slice(0, 5) });
}
