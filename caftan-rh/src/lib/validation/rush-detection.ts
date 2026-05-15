// Detection des semaines "rush" qui imposent une validation employee.
// Karim 15/05/2026 :
//  "obligatoire avant chaque grand rush :
//   - vacances scolaires
//   - jours feries internationaux
//   - 15 derniers jours du Ramadan
//   - jours feries qui tombe avant ou apres le weekend amplifiant le rush"

import { addDays, parseISODate, toISODate, startOfWeek } from "@/lib/planning";

export type RushHoliday = {
  date: string;
  priority: number | null;
  kind: string | null;
  shops_closed: boolean | null;
  staff_multiplier: number | string | null;
};

export type RushSeasonalEvent = {
  id: string;
  kind: string | null;
  start_date: string;
  end_date: string;
  /** Label libre (ex: "ramadan", "vacances_scolaires", "soldes") */
  label?: string | null;
};

export type RushDetection = {
  isRush: boolean;
  reasons: string[];
};

/**
 * Verifie si la semaine commencant le `mondayISO` est consideree comme un
 * "grand rush" qui impose une validation employee.
 */
export function detectRushWeek(
  mondayISO: string,
  holidays: RushHoliday[],
  seasonalEvents: RushSeasonalEvent[] = [],
): RushDetection {
  const reasons: string[] = [];
  const monday = parseISODate(mondayISO);
  const weekStartISO = toISODate(monday);
  const weekEndISO = toISODate(addDays(monday, 6));

  // 1. Ferie international ou shops_closed dans la semaine
  for (const h of holidays) {
    if (h.date < weekStartISO || h.date > weekEndISO) continue;
    if (h.kind === "international") {
      reasons.push(`Jour férié international le ${h.date}`);
    } else if (h.shops_closed === true) {
      reasons.push(`Jour férié fermé magasin le ${h.date}`);
    } else if ((h.priority ?? 0) >= 2) {
      reasons.push(`Jour férié majeur le ${h.date}`);
    }
  }

  // 2. Ferie qui borde le weekend (lundi ou vendredi, ou jeudi/mardi
  // adjacent au weekend pour pont) -> amplifie la pression weekend
  for (const h of holidays) {
    if (h.date < weekStartISO || h.date > weekEndISO) continue;
    const d = parseISODate(h.date);
    const dow = d.getDay(); // 0=Dim..6=Sam
    if (dow === 1 || dow === 5) {
      reasons.push(`Pont weekend : férié ${h.date} (${dow === 1 ? "lundi" : "vendredi"})`);
    } else if (dow === 4 || dow === 2) {
      reasons.push(`Pont potentiel : férié ${h.date} (${dow === 4 ? "jeudi" : "mardi"})`);
    }
  }

  // 3. 15 derniers jours du Ramadan (seasonal_events kind='ramadan' OR label).
  // Le seasonal couvre toute la periode du Ramadan ; on regarde si la semaine
  // intersecte la derniere quinzaine (= end_date - 14 .. end_date).
  for (const evt of seasonalEvents) {
    const isRamadan =
      (evt.kind ?? "").toLowerCase().includes("ramadan") ||
      (evt.label ?? "").toLowerCase().includes("ramadan");
    if (!isRamadan) continue;
    const ramadanEnd = parseISODate(evt.end_date);
    const fifteenDaysBefore = toISODate(addDays(ramadanEnd, -14));
    const ramadanEndISO = toISODate(ramadanEnd);
    // Intersection [fifteenDaysBefore, ramadanEndISO] avec [weekStartISO, weekEndISO] ?
    if (weekStartISO <= ramadanEndISO && weekEndISO >= fifteenDaysBefore) {
      reasons.push(`15 derniers jours du Ramadan (jusqu au ${ramadanEndISO})`);
      break;
    }
  }

  // 4. Vacances scolaires (seasonal_events kind/label contient "vacances",
  // "school_break", "ecole", "scolaire").
  for (const evt of seasonalEvents) {
    const text = `${evt.kind ?? ""} ${evt.label ?? ""}`.toLowerCase();
    const isSchool =
      text.includes("scolaire") ||
      text.includes("school_break") ||
      text.includes("vacances") ||
      text.includes("ecole");
    if (!isSchool) continue;
    if (weekStartISO <= evt.end_date && weekEndISO >= evt.start_date) {
      reasons.push(`Vacances scolaires (${evt.start_date} → ${evt.end_date})`);
      break;
    }
  }

  return {
    isRush: reasons.length > 0,
    reasons,
  };
}

/**
 * Helper : retourne le lundi ISO d une semaine contenant `dateISO`.
 */
export function weekMondayOf(dateISO: string): string {
  return toISODate(startOfWeek(parseISODate(dateISO)));
}
