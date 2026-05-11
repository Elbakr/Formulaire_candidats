import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push-notify";

export const dynamic = "force-dynamic";

/**
 * Cron quotidien — pré-alerte 7 jours avant un jour spécial.
 * Pour chaque holiday actif (kind != 'legal') qui a lieu dans les 7 prochains
 * jours, identifie les employés dont fixed_off_days inclut ce jour de la
 * semaine et leur envoie une notification + push : "Tu es OFF habituel ce
 * <jour> mais c'est <event> — on compte sur ta présence." (Force-assignation
 * decision Karim 2026-05-11.)
 *
 * Idempotent : on stocke dans notifications.data.special_day_key pour ne pas
 * re-envoyer la meme notif deux fois.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizonISO = new Date(today.getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // 1) Holidays speciaux dans les 7 jours
  const { data: holsRaw } = await admin
    .from("holidays")
    .select("date, label, kind, priority, tradition")
    .eq("is_active", true)
    .neq("kind", "legal")
    .gte("date", todayISO)
    .lte("date", horizonISO)
    .order("date", { ascending: true });
  const hols = (holsRaw ?? []) as Array<{
    date: string;
    label: string;
    kind: string | null;
    priority: number | null;
    tradition: string | null;
  }>;
  if (hols.length === 0) {
    return NextResponse.json({ ok: true, holidays: 0, notified: 0 });
  }

  // 2) Tous les employes actifs avec fixed_off_days
  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, fixed_off_days, profile_id, status")
    .eq("status", "active");
  type EmpRow = {
    id: string;
    full_name: string;
    fixed_off_days: number[] | null;
    profile_id: string | null;
    status: string;
  };
  const emps = ((empsRaw ?? []) as EmpRow[]).filter(
    (e) => Array.isArray(e.fixed_off_days) && e.fixed_off_days.length > 0,
  );

  // 3) Conges approuves dans la fenetre — on saute les employes deja en conge
  const empIds = emps.map((e) => e.id);
  const { data: leavesRaw } =
    empIds.length === 0
      ? { data: [] }
      : await admin
          .from("time_off_requests")
          .select("employee_id, start_date, end_date, status")
          .in("employee_id", empIds)
          .eq("status", "approved")
          .gte("end_date", todayISO)
          .lte("start_date", horizonISO);
  const leaves = (leavesRaw ?? []) as Array<{
    employee_id: string;
    start_date: string;
    end_date: string;
  }>;
  function hasLeave(empId: string, dateISO: string): boolean {
    return leaves.some(
      (l) =>
        l.employee_id === empId &&
        dateISO >= l.start_date &&
        dateISO <= l.end_date,
    );
  }

  // Convention fixed_off_days : 0=Lun..6=Dim ; Date.getDay() : 0=Dim..6=Sam.
  function isFixedOff(emp: EmpRow, jsDow: number): boolean {
    const isoDow = jsDow === 0 ? 6 : jsDow - 1;
    return (emp.fixed_off_days ?? []).includes(isoDow);
  }

  // 4) Construit la liste des (employee, holiday) qui matchent
  type Match = { emp: EmpRow; hol: (typeof hols)[number]; date: string };
  const matches: Match[] = [];
  for (const h of hols) {
    const d = new Date(h.date + "T00:00:00");
    const jsDow = d.getDay();
    for (const e of emps) {
      if (!isFixedOff(e, jsDow)) continue;
      if (hasLeave(e.id, h.date)) continue;
      matches.push({ emp: e, hol: h, date: h.date });
    }
  }
  if (matches.length === 0) {
    return NextResponse.json({ ok: true, holidays: hols.length, matches: 0 });
  }

  // 5) Idempotence : vérifie quelles paires (recipient, special_day_key) ont
  // deja recu une notif. La cle = "special_day:<date>:<emp_id>".
  const profileIds = matches
    .map((m) => m.emp.profile_id)
    .filter((p): p is string => !!p);
  const { data: existingNotifs } =
    profileIds.length === 0
      ? { data: [] }
      : await admin
          .from("notifications")
          .select("recipient_id, data")
          .in("recipient_id", profileIds)
          .eq("kind", "special_day_preview");
  type NotifRow = { recipient_id: string; data: Record<string, unknown> | null };
  const sentKeys = new Set<string>();
  for (const n of (existingNotifs ?? []) as NotifRow[]) {
    const key = n.data?.special_day_key as string | undefined;
    if (key) sentKeys.add(`${n.recipient_id}|${key}`);
  }

  // 6) Insère les nouvelles notifications + push
  const inserts: Array<{
    recipient_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
    data: Record<string, unknown>;
  }> = [];
  const pushTargets = new Set<string>();
  for (const m of matches) {
    if (!m.emp.profile_id) continue;
    const key = `special_day:${m.date}:${m.emp.id}`;
    if (sentKeys.has(`${m.emp.profile_id}|${key}`)) continue;
    const d = new Date(m.date + "T00:00:00");
    const dayFr = d.toLocaleDateString("fr-BE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    inserts.push({
      recipient_id: m.emp.profile_id,
      kind: "special_day_preview",
      title: `📣 Jour spécial : ${m.hol.label}`,
      body: `Le ${dayFr} est ton OFF habituel, mais c'est ${m.hol.label} — on compte sur ta présence. Signale toute indispo dès maintenant.`,
      link: "/me/availability",
      data: {
        special_day_key: key,
        date: m.date,
        label: m.hol.label,
        kind: m.hol.kind,
        employee_id: m.emp.id,
      },
    });
    pushTargets.add(m.emp.profile_id);
  }

  if (inserts.length > 0) {
    await admin.from("notifications").insert(inserts);
  }

  let pushResult = { sent: 0, failed: 0 };
  if (pushTargets.size > 0) {
    try {
      pushResult = await sendPushToProfiles([...pushTargets], {
        title: "Jour spécial à venir",
        body: "Tu es présumé·e disponible — vérifie sur l'app.",
        link: "/me/today",
      });
    } catch {
      /* push echo géré dans le helper */
    }
  }

  return NextResponse.json({
    ok: true,
    holidays: hols.length,
    matches: matches.length,
    notifications_created: inserts.length,
    push_sent: pushResult.sent,
    push_failed: pushResult.failed,
  });
}
