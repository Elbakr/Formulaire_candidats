// Wrapper non-"use server" qui ré-exécute la logique du solver de planning
// avec le client admin (service-role) — pour les crons qui n'ont pas de
// session utilisateur. On dédouble une partie du solver minimaliste : on
// lance `previewSitePlanAction` après avoir injecté un faux profil admin
// via le mécanisme de bypass — non, plus simple : on appelle directement
// la fonction interne en passant l'admin client.
//
// Limitation : ce module ne peut pas importer une fonction d'un fichier
// "use server" si cette fonction n'est pas exportée. Pour éviter de
// dupliquer le solver entier, on extrait ici un previewSitePlanAdmin
// minimal — voir le fichier actions.ts pour la version complète. Le cron
// auto-plan-weekly utilise ce runner via `runAutoPlanForSite`.

import { createAdminClient } from "@/lib/supabase/server";
import { startOfWeek, parseISODate, addDays, toISODate, weekRange } from "@/lib/planning";

type SiteNeed = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  headcount: number;
  role: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  status: string;
  fixed_off_days: number[] | null;
  default_pause_minutes: number | null;
  weekly_hours: number | null;
};

type ExistingShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
};

type Off = { employee_id: string; start_date: string; end_date: string };

type EmpUnavail = {
  employee_id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string | null;
  end_time: string | null;
};

const DAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return timeToMin(aS) < timeToMin(bE) && timeToMin(aE) > timeToMin(bS);
}

function slotHours(start: string, end: string): number {
  return Math.max(0, timeToMin(end) - timeToMin(start)) / 60;
}

function netShiftHours(start: string, end: string, breakMin: number): number {
  return Math.max(0, (timeToMin(end) - timeToMin(start) - breakMin) / 60);
}

function isOffOrLeave(
  e: EmployeeRow,
  dateISO: string,
  dayJsDow: number,
  offs: Off[],
): boolean {
  const isoDow = dayJsDow === 0 ? 6 : dayJsDow - 1;
  if ((e.fixed_off_days ?? []).includes(isoDow)) return true;
  return offs.some(
    (o) =>
      o.employee_id === e.id &&
      dateISO >= o.start_date &&
      dateISO <= o.end_date,
  );
}

function hasConflict(
  empId: string,
  dateISO: string,
  start: string,
  end: string,
  shifts: Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
  }>,
): boolean {
  return shifts.some(
    (s) =>
      s.employee_id === empId &&
      s.date === dateISO &&
      overlaps(s.start_time, s.end_time, start, end),
  );
}

function hasUnavailabilityOverlap(
  empId: string,
  dateISO: string,
  dayJsDow: number,
  needS: string,
  needE: string,
  unavail: EmpUnavail[],
): boolean {
  return unavail.some((u) => {
    if (u.employee_id !== empId) return false;
    const matchesDay =
      u.day_of_week === dayJsDow || u.date_specific === dateISO;
    if (!matchesDay) return false;
    if (!u.start_time || !u.end_time) return true;
    return overlaps(u.start_time, u.end_time, needS, needE);
  });
}

export type AutoPlanPreview = {
  drafts: Array<{
    employee_id: string;
    employee_name: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    position: string | null;
    site_id: string;
    need_id: string;
    is_renfort: boolean;
    pool_tier: 1 | 2 | 3;
    is_overtime: boolean;
    overtime_multiplier: number | null;
  }>;
  uncovered: Array<{
    date: string;
    day_label: string;
    start_time: string;
    end_time: string;
    role: string | null;
    missing: number;
    reason: string;
  }>;
  weekStart: string;
  weekEnd: string;
  contract_usage: Array<{
    employee_id: string;
    employee_name: string;
    weekly_hours: number;
    used_hours_this_plan: number;
    used_hours_total_week: number;
    days_planned: number;
  }>;
};

/**
 * Préview du planning d'un site sur une semaine, avec un service-role client
 * (callable depuis un cron sans session utilisateur).
 * C'est le miroir non-"use server" de `previewSitePlanAction`.
 */
export async function previewSitePlanAdmin(
  siteCode: string,
  weekISO: string,
): Promise<AutoPlanPreview | { error: string }> {
  const supabase = createAdminClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, code")
    .eq("code", siteCode.toUpperCase())
    .maybeSingle();
  if (!site) return { error: "Site introuvable." };
  const siteId = (site as { id: string }).id;

  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);

  const [
    { data: needsRaw },
    { data: siteAssignsRaw },
    { data: allActiveEmpsRaw },
    { data: shiftsRaw },
    { data: offRaw },
    { data: closures },
    { data: holidays },
    { data: unavailRaw },
  ] = await Promise.all([
    supabase
      .from("site_needs")
      .select("id, day_of_week, start_time, end_time, headcount, role")
      .eq("site_id", siteId)
      .order("day_of_week")
      .order("start_time"),
    supabase
      .from("site_assignments")
      .select("employee_id, is_primary")
      .eq("site_id", siteId)
      .lte("start_date", end)
      .or(`end_date.is.null,end_date.gte.${start}`),
    supabase
      .from("employees")
      .select(
        "id, full_name, status, fixed_off_days, default_pause_minutes, weekly_hours",
      )
      .eq("status", "active"),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("company_closures")
      .select("start_date, end_date, department_id")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("holidays")
      .select("date, priority")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end)
      .gte("priority", 2),
    supabase
      .from("employee_unavailabilities")
      .select(
        "employee_id, day_of_week, date_specific, start_time, end_time, is_active",
      )
      .eq("is_active", true)
      .or(
        `date_specific.is.null,and(date_specific.gte.${start},date_specific.lte.${end})`,
      ),
  ]);

  const needs = (needsRaw ?? []) as SiteNeed[];
  if (needs.length === 0)
    return { error: "Aucun besoin défini pour ce site (site_needs vide)." };

  const tierByEmp = new Map<string, 1 | 2 | 3>();
  for (const a of (siteAssignsRaw ?? []) as Array<{
    employee_id: string;
    is_primary: boolean;
  }>) {
    tierByEmp.set(a.employee_id, a.is_primary ? 1 : 2);
  }

  const allEmployees = ((allActiveEmpsRaw ?? []) as EmployeeRow[]).filter(
    (e) => e.status === "active",
  );
  if (allEmployees.length === 0)
    return {
      error: "Aucun employé actif. Crée d'abord des employés.",
    };

  const existing = (shiftsRaw ?? []) as ExistingShift[];
  const offs = (offRaw ?? []) as Off[];
  const blockedDates = new Set(
    ((holidays ?? []) as Array<{ date: string }>).map((h) => h.date),
  );
  const closedDates = new Set<string>();
  for (const c of (closures ?? []) as Array<{
    start_date: string;
    end_date: string;
  }>) {
    let d = parseISODate(c.start_date);
    const last = parseISODate(c.end_date);
    while (d <= last) {
      closedDates.add(toISODate(d));
      d = addDays(d, 1);
    }
  }
  const unavail = ((unavailRaw ?? []) as EmpUnavail[]).filter(
    (u) =>
      u.day_of_week !== null ||
      (u.date_specific !== null &&
        u.date_specific >= start &&
        u.date_specific <= end),
  );

  const plannedHours = new Map<string, number>();
  const plannedDays = new Map<string, Set<string>>();
  for (const e of allEmployees) {
    plannedHours.set(e.id, 0);
    plannedDays.set(e.id, new Set());
  }
  for (const s of existing) {
    plannedHours.set(
      s.employee_id,
      (plannedHours.get(s.employee_id) ?? 0) +
        netShiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
    );
    const set = plannedDays.get(s.employee_id) ?? new Set<string>();
    set.add(s.date);
    plannedDays.set(s.employee_id, set);
  }

  const drafts: AutoPlanPreview["drafts"] = [];
  const uncovered: AutoPlanPreview["uncovered"] = [];

  for (let dow = 0; dow < 7; dow++) {
    const dayDate = (() => {
      const offset = dow === 0 ? 6 : dow - 1;
      return addDays(monday, offset);
    })();
    const dateISO = toISODate(dayDate);
    const dayJsDow = dayDate.getDay();
    if (blockedDates.has(dateISO) || closedDates.has(dateISO)) continue;

    const dayNeeds = needs
      .filter((n) => n.day_of_week === dayJsDow)
      .sort(
        (a, b) =>
          slotHours(b.start_time, b.end_time) -
          slotHours(a.start_time, a.end_time),
      );

    for (const need of dayNeeds) {
      const need_s = need.start_time.slice(0, 5);
      const need_e = need.end_time.slice(0, 5);
      const slotH = slotHours(need_s, need_e);
      const eligible: EmployeeRow[] = [];
      let countOff = 0;
      let countBusy = 0;
      let countCapped = 0;
      let countAvailable = 0;

      for (const e of allEmployees) {
        if (isOffOrLeave(e, dateISO, dayJsDow, offs)) {
          countOff += 1;
          continue;
        }
        if (hasUnavailabilityOverlap(e.id, dateISO, dayJsDow, need_s, need_e, unavail)) {
          countOff += 1;
          continue;
        }
        if (hasConflict(e.id, dateISO, need_s, need_e, existing)) {
          countBusy += 1;
          continue;
        }
        if (
          hasConflict(
            e.id,
            dateISO,
            need_s,
            need_e,
            drafts.map((d) => ({
              employee_id: d.employee_id,
              date: d.date,
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          )
        ) {
          countBusy += 1;
          continue;
        }
        const cap = e.weekly_hours ?? 38;
        const used = plannedHours.get(e.id) ?? 0;
        if (used + slotH > cap + 1e-6) {
          countCapped += 1;
          continue;
        }
        countAvailable += 1;
        eligible.push(e);
      }

      eligible.sort((a, b) => {
        const da = plannedDays.get(a.id)?.size ?? 0;
        const db = plannedDays.get(b.id)?.size ?? 0;
        if (da !== db) return da - db;
        const ta = tierByEmp.get(a.id) ?? 3;
        const tb = tierByEmp.get(b.id) ?? 3;
        if (ta !== tb) return ta - tb;
        const ha = plannedHours.get(a.id) ?? 0;
        const hb = plannedHours.get(b.id) ?? 0;
        return ha - hb;
      });

      let remaining = need.headcount;
      for (const emp of eligible) {
        if (remaining <= 0) break;
        const tier = (tierByEmp.get(emp.id) ?? 3) as 1 | 2 | 3;
        drafts.push({
          employee_id: emp.id,
          employee_name: emp.full_name,
          date: dateISO,
          start_time: need_s,
          end_time: need_e,
          break_minutes: emp.default_pause_minutes ?? 30,
          position: need.role,
          site_id: siteId,
          need_id: need.id,
          is_renfort: tier === 3,
          pool_tier: tier,
          is_overtime: false,
          overtime_multiplier: null,
        });
        plannedHours.set(emp.id, (plannedHours.get(emp.id) ?? 0) + slotH);
        const set = plannedDays.get(emp.id) ?? new Set<string>();
        set.add(dateISO);
        plannedDays.set(emp.id, set);
        remaining -= 1;
      }

      const missing = remaining;
      if (missing > 0) {
        let reason = "mixed";
        if (countAvailable === 0) {
          if (countCapped > 0 && countOff === 0 && countBusy === 0)
            reason = "no_hours_left";
          else if (countOff > 0 && countCapped === 0 && countBusy === 0)
            reason = "all_off";
          else if (countBusy > 0 && countCapped === 0 && countOff === 0)
            reason = "all_busy";
          else if (countCapped > 0) reason = "hours_capped";
        } else {
          reason = "not_enough_staff";
        }
        uncovered.push({
          date: dateISO,
          day_label: DAYS_FR[dayJsDow],
          start_time: need_s,
          end_time: need_e,
          role: need.role,
          missing,
          reason,
        });
      }
    }
  }

  const usagePerEmp = new Map<string, number>();
  for (const d of drafts) {
    usagePerEmp.set(
      d.employee_id,
      (usagePerEmp.get(d.employee_id) ?? 0) + slotHours(d.start_time, d.end_time),
    );
  }
  const contract_usage: AutoPlanPreview["contract_usage"] = allEmployees
    .filter(
      (e) =>
        (usagePerEmp.get(e.id) ?? 0) > 0 ||
        (plannedDays.get(e.id)?.size ?? 0) > 0,
    )
    .map((e) => ({
      employee_id: e.id,
      employee_name: e.full_name,
      weekly_hours: e.weekly_hours ?? 38,
      used_hours_this_plan: usagePerEmp.get(e.id) ?? 0,
      used_hours_total_week: plannedHours.get(e.id) ?? 0,
      days_planned: plannedDays.get(e.id)?.size ?? 0,
    }));

  return { drafts, uncovered, weekStart: start, weekEnd: end, contract_usage };
}
