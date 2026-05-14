// Logique de fractionnement automatique d'un shift au seuil du quota hebdo.
//
// Probleme initial (Karim 2026-05-14) : les heures sup etaient comptabilisees
// alors que le quota contractuel n'etait pas encore atteint. Si un shift de
// 8h est ajoute alors qu'il reste 3h de contractuel pour la semaine, le
// systeme refusait (ou exigeait que l'admin marque is_overtime=true sur la
// totalite). Maintenant on fractionne : 3h contractuelles + 5h heures sup.
//
// L'horaire reste contigu : la pause repas (break_minutes) est attachee au
// segment contractuel (commune en pratique).

export type ShiftSegment = {
  start_time: string; // "HH:MM"
  end_time: string;
  break_minutes: number;
  is_overtime: boolean;
  overtime_multiplier: number | null;
};

export type SplitResult = {
  regular: ShiftSegment | null;
  overtime: ShiftSegment | null;
  /** Heures productives totales (sans pause) du shift entier. */
  totalProductiveHours: number;
  /** Heures productives placees en contractuel apres split. */
  regularHours: number;
  /** Heures productives placees en OT apres split. */
  overtimeHours: number;
};

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calcule le fractionnement d'un shift contigue en deux segments (contractuel
 * + heures sup) selon les heures contractuelles deja consommees dans la
 * semaine.
 *
 * @param startTime  "HH:MM"
 * @param endTime    "HH:MM"
 * @param breakMinutes Pause non remuneree (rattachee au segment contractuel).
 * @param alreadyContractualHours Heures contractuelles deja planifiees dans
 *   la semaine, hors ce shift (= somme des shifts is_overtime=false hors
 *   shift en cours d'edition).
 * @param weeklyTargetHours Quota hebdomadaire (employees.weekly_hours).
 * @param otMultiplier Multiplicateur OT a appliquer au segment OT (defaut 1.5).
 */
export function splitShiftForQuota(args: {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  alreadyContractualHours: number;
  weeklyTargetHours: number;
  otMultiplier?: number;
}): SplitResult {
  const startMin = timeToMin(args.startTime);
  const endMin = timeToMin(args.endTime);
  const totalElapsedMin = Math.max(0, endMin - startMin);
  const breakMin = Math.max(0, args.breakMinutes);
  const totalProductiveMin = Math.max(0, totalElapsedMin - breakMin);
  const totalProductiveHours = totalProductiveMin / 60;
  const multiplier = args.otMultiplier ?? 1.5;

  if (totalProductiveHours <= 0) {
    return {
      regular: null,
      overtime: null,
      totalProductiveHours: 0,
      regularHours: 0,
      overtimeHours: 0,
    };
  }

  const remainingQuota = Math.max(
    0,
    args.weeklyTargetHours - args.alreadyContractualHours,
  );

  // Cas 1 : pas de reserve, tout le shift est OT.
  if (remainingQuota <= 0.001) {
    return {
      regular: null,
      overtime: {
        start_time: args.startTime,
        end_time: args.endTime,
        break_minutes: breakMin,
        is_overtime: true,
        overtime_multiplier: multiplier,
      },
      totalProductiveHours,
      regularHours: 0,
      overtimeHours: totalProductiveHours,
    };
  }

  // Cas 2 : le shift tient dans la reserve, pas de split necessaire.
  if (totalProductiveHours <= remainingQuota + 0.001) {
    return {
      regular: {
        start_time: args.startTime,
        end_time: args.endTime,
        break_minutes: breakMin,
        is_overtime: false,
        overtime_multiplier: null,
      },
      overtime: null,
      totalProductiveHours,
      regularHours: totalProductiveHours,
      overtimeHours: 0,
    };
  }

  // Cas 3 : split. Le segment contractuel a `remainingQuota` heures productives
  // + la pause. Le segment OT prend le reste, sans pause.
  const regularProductiveMin = Math.round(remainingQuota * 60);
  const splitMin = startMin + regularProductiveMin + breakMin;
  const splitHHMM = minToHHMM(splitMin);

  const overtimeProductiveH = totalProductiveHours - remainingQuota;

  return {
    regular: {
      start_time: args.startTime,
      end_time: splitHHMM,
      break_minutes: breakMin,
      is_overtime: false,
      overtime_multiplier: null,
    },
    overtime: {
      start_time: splitHHMM,
      end_time: args.endTime,
      break_minutes: 0,
      is_overtime: true,
      overtime_multiplier: multiplier,
    },
    totalProductiveHours,
    regularHours: remainingQuota,
    overtimeHours: overtimeProductiveH,
  };
}
