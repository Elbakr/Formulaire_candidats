import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Vendredi 18h Europe/Brussels — relance les managers qui n'ont pas noté
// leurs employés depuis 2 semaines. Notification + DM.

function startOfWeekUTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const day = out.getUTCDay(); // 0 = sunday
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  const now = new Date();
  const w0 = startOfWeekUTC(now);
  const w1 = new Date(w0.getTime() - 7 * 86_400_000);
  const w2 = new Date(w0.getTime() - 14 * 86_400_000);
  const w1ISO = isoDate(w1);
  const w2ISO = isoDate(w2);

  // 1. Liste des managers actifs (rôle = manager OU admin/rh qui ont des employés rattachés).
  const { data: managers } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("role", ["manager", "admin", "rh"]);
  type ManagerRow = { id: string; full_name: string | null };
  const managerArr = (managers ?? []) as ManagerRow[];

  let totalNotifs = 0;
  let totalDmMessages = 0;
  const summary: Array<{ manager: string; missing: number }> = [];

  for (const mgr of managerArr) {
    // Employés sous sa responsabilité directe.
    const { data: emps } = await admin
      .from("employees")
      .select("id, full_name")
      .eq("status", "active")
      .eq("manager_id", mgr.id);
    type Emp = { id: string; full_name: string };
    const empArr = (emps ?? []) as Emp[];
    if (empArr.length === 0) continue;

    const empIds = empArr.map((e) => e.id);

    // Notes existantes pour W-1 et W-2.
    const { data: ratings } = await admin
      .from("weekly_employee_ratings")
      .select("employee_id, week_monday")
      .in("employee_id", empIds)
      .in("week_monday", [w1ISO, w2ISO]);
    type RatingRow = { employee_id: string; week_monday: string };
    const ratedSet = new Set(
      ((ratings ?? []) as RatingRow[]).map((r) => `${r.employee_id}|${r.week_monday}`),
    );

    const missingEmployees = empArr.filter(
      (e) => !ratedSet.has(`${e.id}|${w1ISO}`) && !ratedSet.has(`${e.id}|${w2ISO}`),
    );
    if (missingEmployees.length === 0) continue;

    // Notification.
    const names = missingEmployees
      .slice(0, 4)
      .map((e) => e.full_name)
      .join(", ");
    const more = missingEmployees.length > 4 ? ` (+${missingEmployees.length - 4} autres)` : "";
    await admin.from("notifications").insert({
      recipient_id: mgr.id,
      kind: "reminder",
      title: "Notation hebdo — relance",
      body: `Tu n'as pas noté ${names}${more} depuis 2 semaines. Profite du week-end pour faire le tour.`,
      link: "/scoring/weekly",
      data: { missing: missingEmployees.length },
    });
    totalNotifs += 1;

    // DM via le chat (cherche un DM bot/system existant ou crée une note interne).
    // V1 : on retombe simplement sur la notification. Si tu veux un vrai DM,
    // il faudrait définir un "system bot profile" — non bloquant pour l'instant.
    summary.push({ manager: mgr.full_name ?? mgr.id, missing: missingEmployees.length });
  }

  return NextResponse.json({
    ok: true,
    notifications_created: totalNotifs,
    dm_messages: totalDmMessages,
    week_minus_1: w1ISO,
    week_minus_2: w2ISO,
    summary,
  });
}
