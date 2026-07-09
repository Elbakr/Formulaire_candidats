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
 *      Variante A = jours dispos les PLUS TÔT (début de semaine).
 *      Variante B = jours dispos les PLUS TARD (fin de semaine) → A et B
 *      DIAMÉTRALEMENT opposées pour offrir un vrai choix au travailleur.
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

export type ProposalBreak = { start: string; end: string };

export type ProposalShift = {
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM" — FIN ALLONGÉE (heures travaillées + pauses, exclues des heures)
  hours: number; // heures TRAVAILLÉES (pauses exclues)
  /** Fenêtre de pause prière (vendredi) contournée par ce shift, si applicable. */
  pause?: { start: string; end: string } | null;
  /**
   * 2 pauses quotidiennes (`default_pause_minutes` du travailleur réparti en 2),
   * EXCLUES des heures travaillées : le shift est allongé d'autant. Vide le
   * vendredi quand la pause prière (verrouillée) s'applique (voir buildShift).
   */
  breaks?: ProposalBreak[];
};

export type ProposalWeek = {
  week_index: number; // 0..2
  week_start: string; // "YYYY-MM-DD" (1er jour de la fenêtre de 7 jours)
  week_end: string; // "YYYY-MM-DD"
  shifts: ProposalShift[];
  total_hours: number;
};

export type ProposalVariant = {
  label: "A" | "B" | "C";
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
  variant_c: ProposalVariant; // Karim 2026-07-09 : « répartie sur toute la semaine »
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

// ── Pauses quotidiennes fractionnées en 2 (EXCLUES des heures) ───────────────
// `default_pause_minutes` (propre au travailleur) est réparti en 2 pauses placées
// ~1/3 et ~2/3 du TEMPS TRAVAILLÉ (jamais en tout début/fin de shift). Elles sont
// exclues des heures : le shift est allongé de la durée totale de pause
// (end = start + travaillé + pause). ÉCHELONNEMENT BRABANT (magasins A/B/D) :
// on décale les fenêtres de ce travailleur par rang (offset déterministe = rang ×
// durée d'une demi-pause) pour ne pas chevaucher les pauses des autres présents.
const BREAK_EDGE_MARGIN_MIN = 30; // aucune pause dans les 30 premières/dernières min

function computeDailyBreaks(
  startMin: number,
  workedMin: number,
  pauseMin: number,
  brabant: boolean,
  staggerRank: number,
): ProposalBreak[] {
  if (pauseMin <= 0 || workedMin <= 0) return [];

  const dur1 = Math.round(pauseMin / 2);
  const dur2 = pauseMin - dur1; // somme EXACTE = pauseMin

  // Shift trop court pour 2 pauses lisibles -> 1 pause unique au milieu.
  if (workedMin < 180) {
    const mid = Math.max(1, Math.round(workedMin / 2));
    const s = startMin + mid;
    return [{ start: minToTime(s), end: minToTime(s + pauseMin) }];
  }

  // Fenêtre de placement (en minutes travaillées écoulées), marge aux extrémités.
  const lo = Math.min(BREAK_EDGE_MARGIN_MIN, Math.floor(workedMin / 4));
  const hi = workedMin - lo;
  const span = Math.max(1, hi - lo);

  // Ancres ~1/3 et ~2/3 de la fenêtre + décalage Brabant (déterministe par rang),
  // enroulé dans la fenêtre pour rester dans le shift même à rang élevé.
  const off = brabant && staggerRank > 0 ? staggerRank * dur1 : 0;
  const mod = (n: number) => (((n % span) + span) % span);
  const r1 = mod(Math.round(span / 3) + off);
  const r2 = mod(Math.round((2 * span) / 3) + off);
  // min/max garantit l'ordre (a1<a2) ; l'écart reste ≥ span/3 (> durée de pause).
  const a1 = lo + Math.min(r1, r2);
  const a2 = lo + Math.max(r1, r2);

  // Retour en heure murale : la 2e pause survient après la 1re (déjà « prise »).
  const b1s = startMin + a1;
  const b2s = startMin + a2 + dur1;
  return [
    { start: minToTime(b1s), end: minToTime(b1s + dur1) },
    { start: minToTime(b2s), end: minToTime(b2s + dur2) },
  ];
}

// ── Construction d'un shift (pauses quotidiennes + contournement pause vendredi) ─
function buildShift(
  iso: string,
  startMin: number,
  workedHours: number,
  prayer: ProposalPrayerPause,
  pauseMin: number,
  brabant: boolean,
  staggerRank: number,
): ProposalShift {
  const workedMin = Math.round(workedHours * 60);
  let endMin = startMin + workedMin;
  let pause: { start: string; end: string } | null = null;
  let breaks: ProposalBreak[] = [];

  // PAUSE VENDREDI VERROUILLÉE (prière) : si le shift chevauche la fenêtre, on ne
  // travaille PAS pendant la pause -> on allonge la fin du shift de sa durée. Ce
  // jour-là, la pause prière FAIT OFFICE de pause du travailleur : on N'AJOUTE PAS
  // les 2 pauses génériques (sinon on doublerait/contredirait le carve-out prière,
  // et la fenêtre prière — commune à tous, verrouillée — n'est pas échelonnée).
  const pw = prayerPauseForISO(iso, prayer);
  if (pw) {
    const pS = timeToMin(pw.start);
    const pE = timeToMin(pw.end);
    if (startMin < pE && endMin > pS) {
      pause = { start: pw.start, end: pw.end };
      endMin += pE - pS;
    }
  }

  // Jours SANS pause prière effective : 2 pauses quotidiennes fractionnées,
  // exclues des heures -> on allonge la fin du shift de la durée totale de pause.
  if (!pause && pauseMin > 0) {
    breaks = computeDailyBreaks(startMin, workedMin, pauseMin, brabant, staggerRank);
    endMin += pauseMin;
  }

  return {
    date: iso,
    start_time: minToTime(startMin),
    end_time: minToTime(endMin),
    hours: Number(workedHours.toFixed(2)),
    pause,
    breaks,
  };
}

// ── Jours DISPONIBLES d'une fenêtre de 7 jours (hors OFF / indispo) ──────────
// Teste le blocage indispo sur la plage d'un shift PLEIN (start..start+shiftHours) :
// suffisant pour un skip journée (Phase 1). Retour = dates ISO chronologiques.
function computeAvailableDays(
  weekStartISO: string,
  startMin: number,
  fullShiftEndMin: number,
  fixedOffDays: Set<number>,
  unavail: ProposalUnavailability[],
): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysISO(weekStartISO, i));
  return days.filter(
    (iso) =>
      !isFixedOff(iso, fixedOffDays) &&
      !isDayBlockedByUnavail(iso, startMin, fullShiftEndMin, unavail),
  );
}

// ── Répartition « SPREAD » (variante C) : un shift sur CHAQUE jour dispo ──────
// Karim 2026-07-09 : au lieu de concentrer les heures sur des jours consécutifs
// (A début / B fin), la variante C COUVRE TOUS les jours à disponibilité libre de
// la semaine, en répartissant `weeklyHours` sur l'ENSEMBLE de ces jours :
//   durée/jour = min(defaultShiftHours, weeklyHours / joursDispos)   (équitable, plafonnée)
// Détails :
//  - Si weeklyHours suffit pour un shift plein partout -> chaque jour = shift plein.
//  - Si insuffisant -> shifts plus courts mais TOUS les jours dispos couverts.
//  - Répartition à la MINUTE (reliquat étalé sur les 1ers jours) pour que la somme
//    = weeklyHours (au plafond près : semaine partielle si weeklyHours > joursDispos×plein).
//  - Pas de micro-shift < 15 min : si la part/jour tombe sous 15 min, on RÉDUIT
//    le nombre de jours couverts (jours choisis de façon ÉQUILIBRÉE dans la semaine)
//    et on le signale via `reducedMicro`.
//  - Mêmes pauses (2 créneaux hors heures), pause vendredi verrouillée et
//    échelonnement Brabant que A/B (via buildShift).
const MIN_SHIFT_MIN = 15; // pas de micro-shift < 15 min

/** Choisit K dates ÉQUILIBRÉES (réparties) parmi `all` (K ≤ all.length). */
function pickEvenlySpaced(all: string[], k: number): string[] {
  if (k >= all.length) return [...all];
  if (k <= 0) return [];
  if (k === 1) return [all[Math.floor(all.length / 2)]];
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    out.push(all[Math.round((i * (all.length - 1)) / (k - 1))]);
  }
  // Dédoublonne (arrondis peuvent collisionner) puis complète si besoin.
  const seen = new Set(out);
  if (seen.size < k) {
    for (const iso of all) {
      if (seen.size >= k) break;
      if (!seen.has(iso)) seen.add(iso);
    }
  }
  return all.filter((iso) => seen.has(iso));
}

function fillWeekSpread(args: {
  weekIndex: number;
  weekStartISO: string;
  weeklyHours: number;
  startMin: number;
  shiftHours: number;
  fixedOffDays: Set<number>;
  unavail: ProposalUnavailability[];
  prayer: ProposalPrayerPause;
  pauseMin: number;
  brabant: boolean;
  staggerRank: number;
}): { week: ProposalWeek; reducedMicro: boolean } {
  const {
    weekIndex,
    weekStartISO,
    weeklyHours,
    startMin,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
    pauseMin,
    brabant,
    staggerRank,
  } = args;

  const capMin = Math.round(shiftHours * 60);
  const targetMin = Math.round(weeklyHours * 60);
  const fullShiftEndMin = startMin + capMin;
  const available = computeAvailableDays(
    weekStartISO,
    startMin,
    fullShiftEndMin,
    fixedOffDays,
    unavail,
  );

  const emptyWeek: ProposalWeek = {
    week_index: weekIndex,
    week_start: weekStartISO,
    week_end: addDaysISO(weekStartISO, 6),
    shifts: [],
    total_hours: 0,
  };
  if (available.length === 0 || targetMin <= 0 || capMin <= 0) {
    return { week: emptyWeek, reducedMicro: false };
  }

  // Nombre de jours couverts = TOUS les dispos, sauf si la part/jour tomberait
  // sous MIN_SHIFT_MIN -> on réduit (jours équilibrés) et on le signale.
  let daysToCover = available.length;
  let reducedMicro = false;
  if (targetMin < daysToCover * MIN_SHIFT_MIN) {
    daysToCover = Math.max(1, Math.floor(targetMin / MIN_SHIFT_MIN));
    reducedMicro = true;
  }
  const coveredDays = pickEvenlySpaced(available, daysToCover);

  // Répartition à la minute : chaque jour = base (+1 min pour les `rem` premiers),
  // plafonné à capMin. placeMin = ce qu'on peut réellement poser (semaine partielle
  // si weeklyHours dépasse joursDispos × shift plein).
  const placeMin = Math.min(targetMin, coveredDays.length * capMin);
  const base = Math.floor(placeMin / coveredDays.length);
  const rem = placeMin - base * coveredDays.length;

  const shifts: ProposalShift[] = [];
  coveredDays.forEach((iso, idx) => {
    const workedMin = Math.min(capMin, base + (idx < rem ? 1 : 0));
    if (workedMin < MIN_SHIFT_MIN) return; // garde-fou (ne devrait pas arriver)
    shifts.push(
      buildShift(iso, startMin, workedMin / 60, prayer, pauseMin, brabant, staggerRank),
    );
  });

  shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const total = shifts.reduce((s, x) => s + x.hours, 0);
  return {
    week: {
      week_index: weekIndex,
      week_start: weekStartISO,
      week_end: addDaysISO(weekStartISO, 6),
      shifts,
      total_hours: Number(total.toFixed(2)),
    },
    reducedMicro,
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
  pauseMin: number;
  brabant: boolean;
  staggerRank: number;
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
    pauseMin,
    brabant,
    staggerRank,
  } = args;

  // Jours de la fenêtre + filtre dispo (OFF / indispo). On teste le blocage
  // indispo sur la plage d'un shift PLEIN (start..start+shiftHours) : suffisant
  // pour un skip journée en Phase 1.
  const fullShiftEndMin = startMin + Math.round(shiftHours * 60);
  const available = computeAvailableDays(
    weekStartISO,
    startMin,
    fullShiftEndMin,
    fixedOffDays,
    unavail,
  );

  // Karim 2026-07-09 : les 2 variantes doivent être DIAMÉTRALEMENT OPPOSÉES pour
  // offrir un vrai choix au travailleur (début de semaine VS fin de semaine).
  //   startOffset 0 (variante A) = jours les PLUS TÔT dispos (remplissage depuis le
  //                                 début de la semaine) ;
  //   startOffset != 0 (variante B) = jours les PLUS TARD dispos (remplissage depuis
  //                                    la FIN de la semaine, ordre inversé).
  const fillOrder = startOffset === 0 ? [...available] : [...available].reverse();

  const shifts: ProposalShift[] = [];
  let remaining = weeklyHours;
  for (const iso of fillOrder) {
    if (remaining <= 0.01) break;
    const worked = Math.min(shiftHours, remaining);
    if (worked < 0.25) break; // pas de micro-shift < 15 min
    shifts.push(buildShift(iso, startMin, worked, prayer, pauseMin, brabant, staggerRank));
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
  pauseMin: number;
  brabant: boolean;
  staggerRank: number;
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
        pauseMin: args.pauseMin,
        brabant: args.brabant,
        staggerRank: args.staggerRank,
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

// ── Variante C « répartie sur toute la semaine » (spread) ────────────────────
function buildVariantC(args: {
  startDate: string;
  weeks: number;
  weeklyHours: number;
  startMin: number;
  shiftHours: number;
  fixedOffDays: Set<number>;
  unavail: ProposalUnavailability[];
  prayer: ProposalPrayerPause;
  pauseMin: number;
  brabant: boolean;
  staggerRank: number;
}): { variant: ProposalVariant; reducedMicro: boolean } {
  const weeksArr: ProposalWeek[] = [];
  let reducedMicro = false;
  for (let w = 0; w < args.weeks; w++) {
    const { week, reducedMicro: r } = fillWeekSpread({
      weekIndex: w,
      weekStartISO: addDaysISO(args.startDate, w * 7),
      weeklyHours: args.weeklyHours,
      startMin: args.startMin,
      shiftHours: args.shiftHours,
      fixedOffDays: args.fixedOffDays,
      unavail: args.unavail,
      prayer: args.prayer,
      pauseMin: args.pauseMin,
      brabant: args.brabant,
      staggerRank: args.staggerRank,
    });
    weeksArr.push(week);
    if (r) reducedMicro = true;
  }
  const total = weeksArr.reduce((s, w) => s + w.total_hours, 0);
  return {
    variant: {
      label: "C",
      strategy: "Répartie sur TOUS les jours disponibles de la semaine (durée/jour équilibrée)",
      weeks: weeksArr,
      total_hours: Number(total.toFixed(2)),
    },
    reducedMicro,
  };
}

// ── RENFORT / heures supplémentaires (helper pur) ────────────────────────────
// Karim 2026-07-09 : les 3 variantes portent sur des JOURS DIFFÉRENTS et se
// COMPLÈTENT. Un travailleur preste son planning PAR DÉFAUT (la `selected_variant`,
// celle qu'il a choisie), mais s'il est APTE aux heures sup ET libre, on peut lui
// ENCHAÎNER des jours issus des AUTRES variantes quand l'entreprise a un besoin.
// Ce helper calcule ces JOURS-CRÉNEAUX candidats : dates présentes dans les
// variantes NON sélectionnées mais ABSENTES du planning par défaut (dispo exprimée
// via le moteur, non déjà travaillée). Dédoublonné par date (pas de double compte),
// off/indispos déjà exclus en amont par le moteur. INFO RH — aucune activation ici.
export type ReinforcementSlot = {
  date: string; // "YYYY-MM-DD"
  start_time: string; // horaire type (heure de début du shift de la variante)
  end_time: string; // fin (pauses incluses, comme le shift source)
  hours: number; // heures travaillées du créneau
  /** Variantes NON sélectionnées où ce jour apparaît (audit / explicabilité). */
  from_variants: Array<"A" | "B" | "C">;
};

export function computeReinforcementSlots(input: {
  variantA: ProposalVariant | null | undefined;
  variantB: ProposalVariant | null | undefined;
  variantC: ProposalVariant | null | undefined;
  /** Planning PAR DÉFAUT du travailleur ; null/absent -> 'A' (aligné tablette). */
  selectedVariant: "A" | "B" | "C" | null | undefined;
}): ReinforcementSlot[] {
  const byLabel: Record<"A" | "B" | "C", ProposalVariant | null | undefined> = {
    A: input.variantA,
    B: input.variantB,
    C: input.variantC,
  };
  const selected = input.selectedVariant ?? "A";
  const defaultVariant = byLabel[selected] ?? null;

  // Jours DÉJÀ travaillés dans le planning par défaut -> exclus (pas de double).
  const defaultDates = new Set<string>();
  if (defaultVariant) {
    for (const w of defaultVariant.weeks ?? []) {
      for (const s of w.shifts ?? []) defaultDates.add(s.date);
    }
  }

  // Jours des variantes NON sélectionnées, absents du défaut -> candidats renfort.
  const slots = new Map<string, ReinforcementSlot>();
  (["A", "B", "C"] as const).forEach((label) => {
    if (label === selected) return;
    const v = byLabel[label];
    if (!v) return;
    for (const w of v.weeks ?? []) {
      for (const s of w.shifts ?? []) {
        if (defaultDates.has(s.date)) continue; // jamais un jour du défaut
        const existing = slots.get(s.date);
        if (existing) {
          if (!existing.from_variants.includes(label)) existing.from_variants.push(label);
        } else {
          slots.set(s.date, {
            date: s.date,
            start_time: s.start_time,
            end_time: s.end_time,
            hours: s.hours,
            from_variants: [label],
          });
        }
      }
    }
  });

  return Array.from(slots.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
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
  /** Pause quotidienne du travailleur (`default_pause_minutes`), fractionnée en 2
   *  et EXCLUE des heures (shift allongé). Défaut 30 si non renseigné / 0 pour aucune. */
  pauseMinutes?: number | null;
  /** Site principal = magasin BRABANT (A/B/D) -> échelonnement des pauses. */
  brabant?: boolean;
  /** Rang déterministe du travailleur sur son magasin Brabant (0-based) pour
   *  échelonner ses fenêtres de pause vs les autres présents (voir store). */
  staggerRank?: number;
}): PlanningProposal {
  const weeks = input.weeks ?? 3;
  const prayer = input.prayerPause ?? DEFAULT_PROPOSAL_PRAYER_PAUSE;
  const fixedOffDays = new Set<number>((input.fixedOffDays ?? []).filter((n) => n >= 0 && n <= 6));
  const unavail = input.unavailabilities ?? [];
  const pauseMin = Math.max(0, Math.round(Number(input.pauseMinutes ?? 30) || 0));
  const brabant = input.brabant === true;
  const staggerRank = Number.isInteger(input.staggerRank) ? (input.staggerRank as number) : 0;

  const weeklyHours = Number(input.weeklyHours ?? 0);
  const shiftHours = Number(input.defaultShiftHours ?? 0);
  const startTime =
    input.defaultStartTime && /^\d{2}:\d{2}/.test(input.defaultStartTime)
      ? input.defaultStartTime.slice(0, 5)
      : null;

  const emptyVariant = (label: "A" | "B" | "C"): ProposalVariant => ({
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
      variant_c: emptyVariant("C"),
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
    pauseMin,
    brabant,
    staggerRank,
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
    pauseMin,
    brabant,
    staggerRank,
  });

  const { variant: variantC, reducedMicro: cReducedMicro } = buildVariantC({
    startDate: input.startDate,
    weeks,
    weeklyHours,
    startMin,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
    pauseMin,
    brabant,
    staggerRank,
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
  if (cReducedMicro) {
    reasons.push(
      "Variante C : quota hebdo trop faible pour couvrir tous les jours dispos sans micro-shift (<15 min) — nombre de jours réduit et réparti.",
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
    variant_c: variantC,
    reason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}
