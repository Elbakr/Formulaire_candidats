// Calcul de la ponctualite et rigueur via clock_entries / shifts.
// Karim 14/05/2026 : "le pointage ponctuel et toute rigueur de l employe
// pouvant etre relevee au travers la plateforme doit etre prise en compte
// dans le scoring (et inversement)".
//
// Ce module FOURNIT les metriques. Le calcul est TS-side (pas de migration
// DB necessaire). La page scoring ou la fiche employe peut consommer ce
// helper pour afficher des metriques live. L integration dans le
// `global_score` officiel reste une etape DB (migration follow-up).

import { createClient } from "@/lib/supabase/server";

const PUNCTUALITY_TOLERANCE_MIN = 5; // <=5 min = ponctuel
const LATE_THRESHOLD_MIN = 15;        // 5-15 min = en retard
// >15 min = tres en retard (= absence partielle)

export type PunctualityMetrics = {
  employee_id: string;
  /** Nombre de shifts evalues (= shift planifie ET clock_in associe) */
  samples: number;
  /** % de shifts pointes a l heure (clock_in <= shift_start + 5 min) */
  punctual_pct: number;
  /** % de shifts pointes en retard (entre 5 et 15 min) */
  late_pct: number;
  /** % de shifts pointes tres en retard (>15 min) */
  very_late_pct: number;
  /** Retard moyen en minutes (positif = retard) sur l ensemble des shifts */
  avg_late_minutes: number;
  /** Score de rigueur 0-100 (= 100 - mix retards) */
  rigor_score: number;
  /** Bande qualitative */
  band: "exemplary" | "ok" | "attention" | "danger";
};

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function bandFor(rigorScore: number): PunctualityMetrics["band"] {
  if (rigorScore >= 95) return "exemplary";
  if (rigorScore >= 80) return "ok";
  if (rigorScore >= 60) return "attention";
  return "danger";
}

/**
 * Calcule la ponctualite des employes sur les `monthsBack` derniers mois.
 * Compare clock_in_at au shift.start_time pour chaque session lie a un shift.
 */
export async function loadPunctualityForEmployees(
  employeeIds: string[],
  monthsBack: number = 3,
): Promise<Map<string, PunctualityMetrics>> {
  const result = new Map<string, PunctualityMetrics>();
  if (employeeIds.length === 0) return result;

  const supabase = await createClient();
  const since = new Date(Date.now() - monthsBack * 30 * 86_400_000).toISOString();

  // Joint clock_entries (in) + shifts via shift_id. On charge tout d un coup.
  const { data: clockRaw } = await supabase
    .from("clock_entries")
    .select("employee_id, shift_id, occurred_at, kind")
    .in("employee_id", employeeIds)
    .eq("kind", "in")
    .gte("occurred_at", since)
    .not("shift_id", "is", null);
  const clockEntries = ((clockRaw ?? []) as Array<{
    employee_id: string;
    shift_id: string;
    occurred_at: string;
    kind: string;
  }>).map((c) => ({
    employee_id: c.employee_id,
    shift_id: c.shift_id,
    clock_in_at: c.occurred_at,
  }));

  if (clockEntries.length === 0) {
    for (const id of employeeIds) {
      result.set(id, {
        employee_id: id,
        samples: 0,
        punctual_pct: 0,
        late_pct: 0,
        very_late_pct: 0,
        avg_late_minutes: 0,
        rigor_score: 100, // pas de donnees = neutral
        band: "ok",
      });
    }
    return result;
  }

  // Charge les shifts referenced.
  const shiftIds = [...new Set(clockEntries.map((c) => c.shift_id))];
  const { data: shiftsRaw } = await supabase
    .from("shifts")
    .select("id, date, start_time")
    .in("id", shiftIds);
  const shiftById = new Map<string, { date: string; start_time: string }>();
  for (const s of (shiftsRaw ?? []) as Array<{ id: string; date: string; start_time: string }>) {
    shiftById.set(s.id, { date: s.date, start_time: s.start_time });
  }

  // Aggrege par employe.
  type Agg = { samples: number; punctual: number; late: number; veryLate: number; totalLateMin: number };
  const aggByEmp = new Map<string, Agg>();
  for (const e of clockEntries) {
    const shift = shiftById.get(e.shift_id);
    if (!shift) continue;
    // shift_start = date + start_time (local timezone, on garde simple)
    const plannedStart = new Date(`${shift.date}T${shift.start_time.slice(0, 5)}:00`);
    const actualStart = new Date(e.clock_in_at);
    const lateMin = (actualStart.getTime() - plannedStart.getTime()) / 60_000;
    const a: Agg = aggByEmp.get(e.employee_id) ?? {
      samples: 0,
      punctual: 0,
      late: 0,
      veryLate: 0,
      totalLateMin: 0,
    };
    a.samples += 1;
    a.totalLateMin += Math.max(0, lateMin); // on ne compte pas le "trop tot"
    if (lateMin <= PUNCTUALITY_TOLERANCE_MIN) a.punctual += 1;
    else if (lateMin <= LATE_THRESHOLD_MIN) a.late += 1;
    else a.veryLate += 1;
    aggByEmp.set(e.employee_id, a);
  }

  // Calcule metrics par employe.
  for (const id of employeeIds) {
    const a = aggByEmp.get(id);
    if (!a || a.samples === 0) {
      result.set(id, {
        employee_id: id,
        samples: 0,
        punctual_pct: 0,
        late_pct: 0,
        very_late_pct: 0,
        avg_late_minutes: 0,
        rigor_score: 100,
        band: "ok",
      });
      continue;
    }
    const punctualPct = (a.punctual / a.samples) * 100;
    const latePct = (a.late / a.samples) * 100;
    const veryLatePct = (a.veryLate / a.samples) * 100;
    const avgLateMin = a.totalLateMin / a.samples;
    // Score rigueur : 100 - (late_pct * 0.5 + very_late_pct * 2)
    // Tres en retard pese 4x plus que en retard.
    const penalty = latePct * 0.5 + veryLatePct * 2;
    const rigorScore = Math.max(0, Math.min(100, 100 - penalty));
    result.set(id, {
      employee_id: id,
      samples: a.samples,
      punctual_pct: punctualPct,
      late_pct: latePct,
      very_late_pct: veryLatePct,
      avg_late_minutes: avgLateMin,
      rigor_score: rigorScore,
      band: bandFor(rigorScore),
    });
  }

  return result;
}
