// Couverture des besoins définis par site : compare les `site_needs`
// (créneaux par jour de la semaine avec headcount) aux shifts effectivement
// planifiés sur la semaine. Renvoie pour chaque site les heures requises,
// planifiées, et le déficit en heures + effectifs manquants.

import { shiftHours } from "@/lib/planning";

export type SiteNeedRow = {
  site_id: string;
  day_of_week: number; // 0=Dim..6=Sam
  start_time: string; // "HH:MM:SS"
  end_time: string;
  headcount: number;
};

export type SiteShiftRow = {
  site_id: string | null;
  date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_overtime?: boolean | null;
};

export type SiteRow = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

export type SiteNeedsCoverage = {
  site_id: string;
  site_code: string;
  site_name: string;
  site_color: string | null;
  required_hours: number;
  planned_hours: number;
  contractual_hours: number;
  overtime_hours: number;
  deficit_hours: number;
  /** Effectifs moyens requis par jour ouvré */
  avg_required_headcount_per_day: number;
  /** Estimation des shifts manquants pour atteindre les besoins (deficit / 7h) */
  missing_shifts_estimate: number;
  band: "danger" | "warn" | "ok" | "over";
};

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function durationHours(start: string, end: string, breakMin = 0): number {
  return (timeToMin(end) - timeToMin(start) - breakMin) / 60;
}

function bandFor(deficitPct: number): SiteNeedsCoverage["band"] {
  // deficitPct > 0 = manque, < 0 = surcouvert
  if (deficitPct > 0.4) return "danger";
  if (deficitPct > 0.15) return "warn";
  if (deficitPct >= -0.15) return "ok";
  return "over";
}

export function computeSiteNeedsCoverage(
  sites: SiteRow[],
  needs: SiteNeedRow[],
  shifts: SiteShiftRow[],
  weekStartISO: string,
): SiteNeedsCoverage[] {
  // weekStartISO = lundi de la semaine, on calcule les 7 jours.
  const monday = new Date(weekStartISO + "T00:00:00");
  const dayOfMonday = monday.getDay(); // 1 normalement
  // map day_of_week (0=Dim..6=Sam) -> date ISO sur cette semaine
  const dateByDow = new Map<number, string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dateByDow.set(d.getDay(), d.toISOString().slice(0, 10));
  }

  // 1. Heures requises par site = somme sur les 7 jours de (duration × headcount)
  const requiredBySite = new Map<string, number>();
  const headcountByDay = new Map<string, Set<number>>(); // site -> set of dow with need
  let totalDaysActive = 0;
  let totalHeadcountActive = 0;
  for (const n of needs) {
    const dur = durationHours(n.start_time, n.end_time, 0);
    const need = dur * Math.max(0, n.headcount);
    requiredBySite.set(n.site_id, (requiredBySite.get(n.site_id) ?? 0) + need);
    const set = headcountByDay.get(n.site_id) ?? new Set<number>();
    set.add(n.day_of_week);
    headcountByDay.set(n.site_id, set);
  }

  // 2. Heures planifiées par site (séparer contractuel / OT)
  const plannedBySite = new Map<string, { contract: number; ot: number }>();
  for (const s of shifts) {
    if (!s.site_id) continue;
    const dur = durationHours(s.start_time, s.end_time, s.break_minutes ?? 0);
    const cur = plannedBySite.get(s.site_id) ?? { contract: 0, ot: 0 };
    if (s.is_overtime) cur.ot += dur;
    else cur.contract += dur;
    plannedBySite.set(s.site_id, cur);
  }

  const rows: SiteNeedsCoverage[] = [];
  for (const site of sites) {
    const required = requiredBySite.get(site.id) ?? 0;
    const planned = plannedBySite.get(site.id) ?? { contract: 0, ot: 0 };
    const total = planned.contract + planned.ot;
    const deficit = required - total;
    const deficitPct = required > 0 ? deficit / required : 0;
    const daysWithNeed = headcountByDay.get(site.id)?.size ?? 0;
    // Effectifs moyens requis : somme headcount * jours actifs / nb jours
    const totalHeadcountSlots = needs
      .filter((n) => n.site_id === site.id)
      .reduce((a, n) => a + n.headcount, 0);
    const avgHeadcount = daysWithNeed > 0 ? totalHeadcountSlots / daysWithNeed : 0;
    rows.push({
      site_id: site.id,
      site_code: site.code,
      site_name: site.name,
      site_color: site.color,
      required_hours: required,
      planned_hours: total,
      contractual_hours: planned.contract,
      overtime_hours: planned.ot,
      deficit_hours: deficit,
      avg_required_headcount_per_day: avgHeadcount,
      missing_shifts_estimate: deficit > 0 ? Math.ceil(deficit / 7) : 0,
      band: bandFor(deficitPct),
    });
    // pour silenceer lint sur var inutile
    void dayOfMonday;
    void totalDaysActive;
    void totalHeadcountActive;
  }
  return rows.sort((a, b) => b.deficit_hours - a.deficit_hours);
}
