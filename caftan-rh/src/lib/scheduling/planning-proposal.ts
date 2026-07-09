/**
 * planning-proposal.ts — MOTEUR (pur, sans DB) de proposition de planning.
 *
 * Karim 2026-07-09 (Phase 1). À la signature du contrat (ou via un bouton sur
 * la fiche), on génère une PROPOSITION de planning sur 3 semaines, en 2 variantes
 * VALIDES et DISTINCTES. AUCUN envoi au travailleur (géré par l'appelant).
 *
 * Règles métier (Karim) :
 *  - Chaque JOUR TRAVAILLÉ = un shift de `defaultShiftHours` h démarrant à
 *    `defaultStartTime` (end_time = start + durée).
 *  - On REMPLIT des JOURS CONSÉCUTIFS DISPONIBLES (à partir de `startDate`)
 *    jusqu'à atteindre le total d'heures contractuel de la semaine
 *    (`weeklyHours`). Le dernier jour peut porter un shift plus court (reliquat).
 *  - On SAUTE : jours OFF fixes, indispo RÉCURRENTE (jour de semaine), indispo
 *    PONCTUELLE (date / période), et on respecte la PAUSE VENDREDI VERROUILLÉE
 *    (le shift du vendredi n'écrase jamais la fenêtre de pause prière : on
 *    l'allonge pour la contourner, les heures travaillées restent inchangées).
 *  - Motif répété chaque semaine sur 3 semaines (indispos ponctuelles réévaluées
 *    semaine par semaine).
 *  - 2 VARIANTES = 2 répartitions VALIDES des MÊMES heures :
 *      Variante A = remplissage consécutif à partir du 1er jour dispo de la semaine.
 *      Variante B = même remplissage décalé d'un cran (démarre au 2e jour dispo,
 *      enroule si besoin) → jeu de jours DIFFÉRENT quand il y a de la marge.
 *  - Défauts manquants → best-effort : proposition vide + `reason` (ne plante pas).
 *
 * Conventions de jours :
 *  - `fixedOffDays` : 0=Lundi … 6=Dimanche (convention `employees.fixed_off_days`).
 *  - `unavailabilities[].day_of_week` : 0=Dimanche … 6=Samedi (convention
 *    `employee_unavailabilities.day_of_week` = JS getDay).
 */

export type ProposalUnavailability = {
  day_of_week: number | null; // 0=Dim..6=Sam (récurrente) — convention JS getDay
  date_specific: string | null; // "YYYY-MM-DD" (ponctuelle, début de période)
  date_end?: string | null; // "YYYY-MM-DD" (fin de période incluse), optionnel
  start_time: string | null; // "HH:MM[:SS]" — null = journée entière
  end_time: string | null;
};

export type ProposalShift = {
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  hours: number; // heures TRAVAILLÉES (pause vendredi exclue)
  /** Fenêtre de pause prière (vendredi) contournée par ce shift, si applicable. */
  pause?: { start: string; end: string } | null;
};

export type ProposalWeek = {
  week_index: number; // 0..2
  week_start: string; // "YYYY-MM-DD" (1er jour de la fenêtre de 7 jours)
  week_end: string; // "YYYY-MM-DD"
  shifts: ProposalShift[];
  total_hours: number;
};

export type ProposalVariant = {
  label: "A" | "B";
  strategy: string; // description lisible (audit)
  weeks: ProposalWeek[];
  total_hours: number;
};

export type PlanningProposal = {
  start_date: string;
  weeks: number;
  weekly_hours: number;
  default_start_time: string;
  default_shift_hours: number;
  variant_a: ProposalVariant;
  variant_b: ProposalVariant;
  reason: string | null; // non-null si best-effort (proposition vide/partielle)
};

// ── Prayer pause (pause vendredi verrouillée) ────────────────────────────────
// Réutilise EXACTEMENT la logique fenêtre été/hiver du reste du planning
// (lib/auto-planning.ts). On la duplique ici en version pure pour garder le
// moteur sans dépendance serveur ; l'appelant fournit les réglages courants.
export type ProposalPrayerPause = {
  enabled: boolean;
  summer: string; // "HH:MM-HH:MM"
  winter: string; // "HH:MM-HH:MM"
  dstStart: string; // "MM-DD" (entrée heure d'été, inclus)
  dstEnd: string; // "MM-DD" (sortie heure d'été, exclu)
};

export const DEFAULT_PROPOSAL_PRAYER_PAUSE: ProposalPrayerPause = {
  enabled: true,
  summer: "13:55-14:45",
  winter: "12:55-13:45",
  dstStart: "04-01",
  dstEnd: "10-01",
};

// ── Helpers temps / dates (purs, sans fuseau : dates civiles) ────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** Ajoute n jours à une date civile "YYYY-MM-DD" sans dépendre du fuseau. */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** getDay() JS (0=Dim..6=Sam) d'une date civile, stable en UTC (pas de -1 jour). */
function jsDowOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Mois-jour "MM-DD" d'une date civile. */
function mmddOf(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${pad2(m)}-${pad2(d)}`;
}

function parseRange(s: string): { start: string; end: string } | null {
  const mm = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec((s ?? "").trim());
  if (!mm) return null;
  return { start: mm[1], end: mm[2] };
}

/** Fenêtre de pause prière pour une date, ou null (hors vendredi / désactivée). */
function prayerPauseForISO(
  iso: string,
  s: ProposalPrayerPause,
): { start: string; end: string } | null {
  if (!s?.enabled) return null;
  if (jsDowOf(iso) !== 5) return null; // 5 = vendredi
  const md = mmddOf(iso);
  const isSummer = md >= s.dstStart && md < s.dstEnd;
  return parseRange(isSummer ? s.summer : s.winter);
}

// ── Convention jours OFF (fixed_off_days : 0=Lun..6=Dim) ──────────────────────
function isFixedOff(iso: string, fixedOffDays: Set<number>): boolean {
  const jsDow = jsDowOf(iso); // 0=Dim..6=Sam
  const isoDow = jsDow === 0 ? 6 : jsDow - 1; // -> 0=Lun..6=Dim
  return fixedOffDays.has(isoDow);
}

// ── Indispos : le jour est-il indisponible pour le shift proposé ? ───────────
// On considère le jour bloqué si une indispo (récurrente OU ponctuelle) est
// journée entière, OU si son créneau chevauche la plage du shift proposé
// [startMin, startMin + shiftMin]. Phase 1 : on SAUTE le jour entier (pas de
// tentative de décalage horaire), pour des variantes lisibles et déterministes.
function isDayBlockedByUnavail(
  iso: string,
  shiftStartMin: number,
  shiftEndMin: number,
  unavail: ProposalUnavailability[],
): boolean {
  const jsDow = jsDowOf(iso);
  for (const u of unavail) {
    const matchRecurring = u.day_of_week != null && u.day_of_week === jsDow;
    const matchSpecific =
      u.date_specific != null &&
      iso >= u.date_specific &&
      iso <= (u.date_end ?? u.date_specific);
    if (!matchRecurring && !matchSpecific) continue;
    // Journée entière (pas de bornes) -> bloqué.
    if (!u.start_time || !u.end_time) return true;
    // Sinon : bloqué seulement si chevauchement avec la plage du shift.
    const uS = timeToMin(u.start_time);
    const uE = timeToMin(u.end_time);
    if (shiftStartMin < uE && shiftEndMin > uS) return true;
  }
  return false;
}

// ── Construction d'un shift (avec contournement pause vendredi) ──────────────
function buildShift(
  iso: string,
  startMin: number,
  workedHours: number,
  prayer: ProposalPrayerPause,
): ProposalShift {
  const workedMin = Math.round(workedHours * 60);
  let endMin = startMin + workedMin;
  let pause: { start: string; end: string } | null = null;

  // PAUSE VENDREDI VERROUILLÉE : si le shift chevauche la fenêtre de pause, on
  // NE travaille PAS pendant la pause -> on allonge la fin du shift de la durée
  // de la pause (heures travaillées inchangées, pause carve-out préservée).
  const pw = prayerPauseForISO(iso, prayer);
  if (pw) {
    const pS = timeToMin(pw.start);
    const pE = timeToMin(pw.end);
    if (startMin < pE && endMin > pS) {
      pause = { start: pw.start, end: pw.end };
      endMin += pE - pS;
    }
  }

  return {
    date: iso,
    start_time: minToTime(startMin),
    end_time: minToTime(endMin),
    hours: Number(workedHours.toFixed(2)),
    pause,
  };
}

// ── Remplissage d'UNE semaine (fenêtre de 7 jours depuis weekStartISO) ───────
function fillWeek(args: {
  weekIndex: number;
  weekStartISO: string;
  weeklyHours: number;
  startMin: number;
  shiftHours: number;
  fixedOffDays: Set<number>;
  unavail: ProposalUnavailability[];
  prayer: ProposalPrayerPause;
  startOffset: number; // 0 = variante A, 1 = variante B
}): ProposalWeek {
  const {
    weekIndex,
    weekStartISO,
    weeklyHours,
    startMin,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
    startOffset,
  } = args;

  // Jours de la fenêtre + filtre dispo (OFF / indispo). On teste le blocage
  // indispo sur la plage d'un shift PLEIN (start..start+shiftHours) : suffisant
  // pour un skip journée en Phase 1.
  const fullShiftEndMin = startMin + Math.round(shiftHours * 60);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysISO(weekStartISO, i));
  const available = days.filter(
    (iso) =>
      !isFixedOff(iso, fixedOffDays) &&
      !isDayBlockedByUnavail(iso, startMin, fullShiftEndMin, unavail),
  );

  // Ordre de remplissage : à partir de l'offset, en enroulant (variante B).
  const ordered =
    available.length > 0
      ? Array.from({ length: available.length }, (_, k) => available[(startOffset + k) % available.length])
      : [];
  // Dédoublonnage défensif (offset + wrap ne doit pas répéter une date).
  const seen = new Set<string>();
  const fillOrder = ordered.filter((iso) => (seen.has(iso) ? false : (seen.add(iso), true)));

  const shifts: ProposalShift[] = [];
  let remaining = weeklyHours;
  for (const iso of fillOrder) {
    if (remaining <= 0.01) break;
    const worked = Math.min(shiftHours, remaining);
    if (worked < 0.25) break; // pas de micro-shift < 15 min
    shifts.push(buildShift(iso, startMin, worked, prayer));
    remaining -= worked;
  }

  // Tri chronologique pour l'affichage (le remplissage B enroule).
  shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const total = shifts.reduce((s, x) => s + x.hours, 0);
  return {
    week_index: weekIndex,
    week_start: weekStartISO,
    week_end: addDaysISO(weekStartISO, 6),
    shifts,
    total_hours: Number(total.toFixed(2)),
  };
}

function buildVariant(args: {
  label: "A" | "B";
  strategy: string;
  startOffset: number;
  startDate: string;
  weeks: number;
  weeklyHours: number;
  startMin: number;
  shiftHours: number;
  fixedOffDays: Set<number>;
  unavail: ProposalUnavailability[];
  prayer: ProposalPrayerPause;
}): ProposalVariant {
  const weeksArr: ProposalWeek[] = [];
  for (let w = 0; w < args.weeks; w++) {
    weeksArr.push(
      fillWeek({
        weekIndex: w,
        weekStartISO: addDaysISO(args.startDate, w * 7),
        weeklyHours: args.weeklyHours,
        startMin: args.startMin,
        shiftHours: args.shiftHours,
        fixedOffDays: args.fixedOffDays,
        unavail: args.unavail,
        prayer: args.prayer,
        startOffset: args.startOffset,
      }),
    );
  }
  const total = weeksArr.reduce((s, w) => s + w.total_hours, 0);
  return {
    label: args.label,
    strategy: args.strategy,
    weeks: weeksArr,
    total_hours: Number(total.toFixed(2)),
  };
}

// ── API publique ─────────────────────────────────────────────────────────────
export function generatePlanningProposal(input: {
  weeklyHours: number | null | undefined;
  defaultStartTime: string | null | undefined; // "HH:MM"
  defaultShiftHours: number | null | undefined;
  unavailabilities: ProposalUnavailability[];
  startDate: string; // "YYYY-MM-DD"
  fixedOffDays?: number[] | null; // 0=Lun..6=Dim
  weeks?: number; // défaut 3
  prayerPause?: ProposalPrayerPause;
  /** Décalage de départ de la variante A (défaut 0 = 1er jour dispo). Sert à
   *  APPLIQUER un modèle enregistré : on force la répartition du modèle en A. */
  variantAOffset?: number;
  /** Décalage de départ de la variante B (défaut 1). */
  variantBOffset?: number;
}): PlanningProposal {
  const weeks = input.weeks ?? 3;
  const prayer = input.prayerPause ?? DEFAULT_PROPOSAL_PRAYER_PAUSE;
  const fixedOffDays = new Set<number>((input.fixedOffDays ?? []).filter((n) => n >= 0 && n <= 6));
  const unavail = input.unavailabilities ?? [];

  const weeklyHours = Number(input.weeklyHours ?? 0);
  const shiftHours = Number(input.defaultShiftHours ?? 0);
  const startTime =
    input.defaultStartTime && /^\d{2}:\d{2}/.test(input.defaultStartTime)
      ? input.defaultStartTime.slice(0, 5)
      : null;

  const emptyVariant = (label: "A" | "B"): ProposalVariant => ({
    label,
    strategy: "Aucune génération (paramètres manquants)",
    weeks: Array.from({ length: weeks }, (_, w) => ({
      week_index: w,
      week_start: addDaysISO(input.startDate, w * 7),
      week_end: addDaysISO(input.startDate, w * 7 + 6),
      shifts: [],
      total_hours: 0,
    })),
    total_hours: 0,
  });

  // Best-effort : si les défauts manquent, on renvoie une proposition vide + raison.
  const missing: string[] = [];
  if (!weeklyHours || weeklyHours <= 0) missing.push("heures hebdo contractuelles (weekly_hours)");
  if (!shiftHours || shiftHours <= 0) missing.push("durée de shift par défaut (default_shift_hours)");
  if (!startTime) missing.push("heure de début par défaut (default_start_time)");
  if (missing.length > 0) {
    return {
      start_date: input.startDate,
      weeks,
      weekly_hours: weeklyHours || 0,
      default_start_time: startTime ?? "",
      default_shift_hours: shiftHours || 0,
      variant_a: emptyVariant("A"),
      variant_b: emptyVariant("B"),
      reason: `Proposition non générée : renseigne ${missing.join(", ")} sur la fiche.`,
    };
  }

  const startMin = timeToMin(startTime!);
  const offsetA = Number.isInteger(input.variantAOffset) ? (input.variantAOffset as number) : 0;
  const offsetB = Number.isInteger(input.variantBOffset) ? (input.variantBOffset as number) : 1;

  const variantA = buildVariant({
    label: "A",
    strategy:
      offsetA === 0
        ? "Remplissage consécutif à partir du 1er jour disponible de la semaine"
        : `Remplissage décalé de ${offsetA} jour(s) dispo (modèle appliqué)`,
    startOffset: offsetA,
    startDate: input.startDate,
    weeks,
    weeklyHours,
    startMin,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
  });

  const variantB = buildVariant({
    label: "B",
    strategy:
      offsetB === 1
        ? "Remplissage décalé d'un cran (démarre au 2e jour disponible, enroule si besoin)"
        : `Remplissage décalé de ${offsetB} jour(s) dispo`,
    startOffset: offsetB,
    startDate: input.startDate,
    weeks,
    weeklyHours,
    startMin,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
  });

  // Raison best-effort : proposition partielle (jours dispo insuffisants) ou
  // variantes identiques (pas de marge : jours dispo = jours nécessaires).
  const reasons: string[] = [];
  const anyPartial = [...variantA.weeks, ...variantB.weeks].some(
    (w) => w.total_hours < weeklyHours - 0.01,
  );
  if (anyPartial) {
    reasons.push(
      "Certaines semaines n'atteignent pas le quota (pas assez de jours disponibles après OFF / indispos).",
    );
  }
  const sameShape =
    JSON.stringify(variantA.weeks.map((w) => w.shifts.map((s) => s.date))) ===
    JSON.stringify(variantB.weeks.map((w) => w.shifts.map((s) => s.date)));
  if (sameShape) {
    reasons.push(
      "Variantes identiques : aucune marge (jours disponibles = jours nécessaires). B = A.",
    );
  }

  return {
    start_date: input.startDate,
    weeks,
    weekly_hours: weeklyHours,
    default_start_time: startTime!,
    default_shift_hours: shiftHours,
    variant_a: variantA,
    variant_b: variantB,
    reason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}
