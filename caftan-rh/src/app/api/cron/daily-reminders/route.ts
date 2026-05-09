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
  const today = new Date();
  const isoToday = today.toISOString().split("T")[0];
  const in7d = new Date(today.getTime() + 7 * 86_400_000).toISOString().split("T")[0];

  // 1) Périodes d'essai qui finissent dans 7 jours
  const { data: trials } = await admin
    .from("employees")
    .select("id, full_name, trial_end_date, manager_id")
    .eq("status", "active")
    .gte("trial_end_date", isoToday)
    .lte("trial_end_date", in7d);

  type Emp = { id: string; full_name: string; trial_end_date: string; manager_id: string | null };
  const trialsArr = (trials ?? []) as unknown as Emp[];

  // 2) Anniversaire d'embauche aujourd'hui
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const { data: anniv } = await admin
    .from("employees")
    .select("id, full_name, start_date, manager_id")
    .eq("status", "active")
    .filter("start_date", "neq", isoToday) // exclu si start_date = today (pas un anniversaire, c'est un démarrage)
    .like("start_date", `%-${m}-${d}`);
  const annivArr = (anniv ?? []) as unknown as Array<{ id: string; full_name: string; start_date: string; manager_id: string | null }>;

  // 3) Notifs aux managers + RH/admin
  const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
  const rhIds = ((rh ?? []) as { id: string }[]).map((p) => p.id);

  const inserts: Array<{ recipient_id: string; kind: string; title: string; body: string; link: string }> = [];

  for (const t of trialsArr) {
    const recipients = new Set<string>([...rhIds]);
    if (t.manager_id) recipients.add(t.manager_id);
    for (const r of recipients) {
      inserts.push({
        recipient_id: r,
        kind: "reminder",
        title: "Fin de période d'essai imminente",
        body: `${t.full_name} : période d'essai se termine le ${t.trial_end_date}.`,
        link: `/planning/employees/${t.id}`,
      });
    }
  }

  for (const a of annivArr) {
    const yearsAgo = today.getFullYear() - new Date(a.start_date).getFullYear();
    if (yearsAgo === 0) continue;
    const recipients = new Set<string>([...rhIds]);
    if (a.manager_id) recipients.add(a.manager_id);
    for (const r of recipients) {
      inserts.push({
        recipient_id: r,
        kind: "reminder",
        title: `Anniversaire d'entrée — ${a.full_name}`,
        body: `${yearsAgo} an${yearsAgo > 1 ? "s" : ""} dans l'équipe aujourd'hui 🎉`,
        link: `/planning/employees/${a.id}`,
      });
    }
  }

  if (inserts.length > 0) {
    await admin.from("notifications").insert(inserts);
  }

  return NextResponse.json({
    ok: true,
    trials: trialsArr.length,
    anniversaries: annivArr.length,
    notifications_created: inserts.length,
  });
}
