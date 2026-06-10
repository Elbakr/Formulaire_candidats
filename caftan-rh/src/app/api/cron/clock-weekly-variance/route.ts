// GET /api/cron/clock-weekly-variance — Karim 2026-06-10 (chantier 3).
//
// Vendredi 17h Europe/Brussels. Compare, sur la SEMAINE ECOULEE (lundi->dimanche)
// pour chaque employé actif :
//   - heures POINTEES  : vue clock_sessions_billing (Tuya = source de vérité)
//   - heures PLANIFIEES : shifts (start/end/break) via shiftHours()
// Si |pointé - planifié| >= VARIANCE_THRESHOLD_HOURS -> notification RH avec
// lien 1-clic vers la fiche prestations de la semaine (correction / vérif).
//
// Comble le trou de la spec "flag automatique des écarts en fin de semaine".
// Lecture seule + insertion de notifications. Idempotent : ne renvoie pas de
// notifs si la semaine a déjà été traitée (utile pour les re-runs manuels).
//
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { shiftHours } from "@/lib/planning";

export const dynamic = "force-dynamic";

const VARIANCE_THRESHOLD_HOURS = 2; // écart hebdo considéré comme significatif

/** Lundi 00:00 UTC de la semaine de `d`. */
function startOfWeekUTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const day = out.getUTCDay(); // 0 = dimanche
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
  const thisMon = startOfWeekUTC(now);
  const lastMon = new Date(thisMon.getTime() - 7 * 86_400_000);
  const lastMonISO = isoDate(lastMon);   // début semaine écoulée (inclus)
  const thisMonISO = isoDate(thisMon);   // début semaine courante (exclu)

  // Idempotence : si on a déjà notifié pour cette semaine, on ne refait rien.
  const { data: already } = await admin
    .from("notifications")
    .select("id")
    .eq("kind", "clock_weekly_variance")
    .eq("data->>week", lastMonISO)
    .limit(1);
  if (already && already.length > 0) {
    return NextResponse.json({ ok: true, skipped: "already_notified", week: lastMonISO });
  }

  // 1) Heures PLANIFIEES par employé (shifts de la semaine écoulée).
  const { data: shiftsRaw } = await admin
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, status")
    .gte("date", lastMonISO)
    .lt("date", thisMonISO);
  type ShiftRow = {
    employee_id: string; date: string; start_time: string | null;
    end_time: string | null; break_minutes: number | null; status: string | null;
  };
  const plannedByEmp = new Map<string, number>();
  for (const s of (shiftsRaw ?? []) as ShiftRow[]) {
    if (s.status === "cancelled") continue;
    if (!s.start_time || !s.end_time) continue;
    const h = shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0);
    plannedByEmp.set(s.employee_id, (plannedByEmp.get(s.employee_id) ?? 0) + h);
  }

  // 2) Heures POINTEES par employé (clock_sessions_billing, Tuya-first).
  const { data: sessRaw } = await admin
    .from("clock_sessions_billing")
    .select("employee_id, duration_minutes")
    .gte("clock_in_at", `${lastMonISO}T00:00:00Z`)
    .lt("clock_in_at", `${thisMonISO}T00:00:00Z`)
    .not("duration_minutes", "is", null);
  type SessRow = { employee_id: string; duration_minutes: number };
  const workedByEmp = new Map<string, number>();
  for (const s of (sessRaw ?? []) as SessRow[]) {
    workedByEmp.set(s.employee_id, (workedByEmp.get(s.employee_id) ?? 0) + Number(s.duration_minutes) / 60);
  }

  // 3) Employés concernés (planifiés ou pointés), actifs uniquement.
  const empIds = [...new Set([...plannedByEmp.keys(), ...workedByEmp.keys()])];
  if (empIds.length === 0) {
    return NextResponse.json({ ok: true, week: lastMonISO, employees_in_variance: 0 });
  }
  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, status")
    .in("id", empIds);
  type EmpRow = { id: string; full_name: string; status: string };
  const empById = new Map(((empsRaw ?? []) as EmpRow[]).map((e) => [e.id, e]));

  // 4) Écarts significatifs.
  const variances: Array<{ id: string; name: string; planned: number; worked: number; diff: number }> = [];
  for (const id of empIds) {
    const emp = empById.get(id);
    if (!emp || emp.status !== "active") continue;
    const planned = Math.round((plannedByEmp.get(id) ?? 0) * 10) / 10;
    const worked = Math.round((workedByEmp.get(id) ?? 0) * 10) / 10;
    const diff = Math.round((worked - planned) * 10) / 10;
    if (Math.abs(diff) >= VARIANCE_THRESHOLD_HOURS) {
      variances.push({ id, name: emp.full_name, planned, worked, diff });
    }
  }

  // 5) Notifie la RH/admin (1 notif par employé en écart x destinataire).
  let notified = 0;
  if (variances.length > 0) {
    const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
    if (hrIds.length > 0) {
      const notifs = variances.flatMap((v) => {
        const sign = v.diff > 0 ? "+" : "";
        const sens = v.diff > 0 ? "de plus que prévu" : "de moins que prévu";
        return hrIds.map((hrId) => ({
          recipient_id: hrId,
          kind: "clock_weekly_variance",
          title: `Écart d'heures à vérifier : ${v.name}`,
          body: `Semaine du ${lastMonISO} — pointé ${v.worked}h vs planifié ${v.planned}h (${sign}${v.diff}h ${sens}).`,
          link: `/planning/employees/${v.id}/prestations?view=week&date=${lastMonISO}`,
          data: { week: lastMonISO, employeeId: v.id, planned: v.planned, worked: v.worked, diff: v.diff },
        }));
      });
      const { error } = await admin.from("notifications").insert(notifs);
      if (!error) notified = variances.length;
    }
  }

  return NextResponse.json({
    ok: true,
    week: lastMonISO,
    employees_in_variance: variances.length,
    notified,
    detail: variances,
  });
}
