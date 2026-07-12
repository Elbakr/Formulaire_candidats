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
 *
 * PLAFOND DE FERMETURE (Karim 2026-07-10) : la fin d'un shift ne dépasse JAMAIS
 * l'heure de fermeture du SITE PRINCIPAL du travailleur pour ce jour. Si
 * `start + heures + pauses` dépasse la fermeture, on ROGNE les heures travaillées
 * de CE jour (fin plafonnée) ; le reliquat se reporte naturellement sur les jours
 * suivants (le remplissage vise `weeklyHours`).
 *
 * SOURCE DE LA FERMETURE (Karim 2026-07-10, v2) : DÉRIVÉE des horaires RÉELS de la
 * table `site_needs` (max des `end_time` du site pour ce jour de semaine, plafond
 * 20:00) — chargée dans le STORE et injectée ici via `siteClosings` (map jsDow ->
 * "HH:MM"). Le moteur reste PUR : il reçoit une map + un `siteCode` de secours, et
 * construit un résolveur `closingFor(iso)` qui prend la valeur `site_needs` du jour
 * si présente, sinon retombe sur la RÈGLE EN DUR `siteClosingMinutes` (site-hours.ts).
 * Plafond absolu 20:00 appliqué dans les deux cas.
 */

import { siteClosingMinutes } from "@/lib/scheduling/site-hours";

/**
 * Résout la fermeture (minutes depuis minuit) d'une date ISO pour le site
 * principal du travailleur. Construit par `generatePlanningProposal` à partir de
 * la map `siteClosings` (dérivée de `site_needs`) + fallback règle en dur.
 */
export type ClosingResolver = (iso: string) => number;

/** Plafond absolu de fermeture : aucune journée ne finit après 20:00. */
const ABSOLUTE_CLOSING_MIN = 20 * 60;

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
  label: string; // "A".."L" (au-delà de C = variants de couverture ouverture→fermeture)
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
  // Karim 2026-07-11 : variants SUPPLÉMENTAIRES (D, E, F…) générés pour les petits
  // contrats afin que l'UNION des variants couvre toute la plage ouverture→fermeture
  // (10:15 → 19:45 site A / fermeture du site). Vide pour les volumes standards.
  variants_extra: ProposalVariant[];
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

// ── Indispos : fenêtres réellement disponibles du jour ───────────────────────
// Karim 2026-07-10 (BUG indispo partielle) : une indispo PARTIELLE ne doit plus
// faire sauter TOUT le jour. On calcule les FENÊTRES LIBRES = journée moins les
// créneaux d'indispo partielle (récurrente `day_of_week` + ponctuelle
// `date_specific`), puis on DÉCALE le shift dans la 1re fenêtre assez large.
// Seule une indispo JOURNÉE ENTIÈRE (start/end null) — ou un OFF fixe — bloque
// réellement le jour.
const DAY_MIN = 24 * 60; // minuit exclu (pas de débordement au lendemain)

/** Le jour est-il bloqué TOTALEMENT (indispo journée entière) ? */
function isFullDayBlocked(iso: string, unavail: ProposalUnavailability[]): boolean {
  const jsDow = jsDowOf(iso);
  for (const u of unavail) {
    const matchRecurring = u.day_of_week != null && u.day_of_week === jsDow;
    const matchSpecific =
      u.date_specific != null &&
      iso >= u.date_specific &&
      iso <= (u.date_end ?? u.date_specific);
    if (!matchRecurring && !matchSpecific) continue;
    if (!u.start_time || !u.end_time) return true; // journée entière -> bloqué
  }
  return false;
}

/** Créneaux d'indispo PARTIELLE applicables ce jour, fusionnés & triés (minutes). */
function partialBusyIntervals(
  iso: string,
  unavail: ProposalUnavailability[],
): Array<{ start: number; end: number }> {
  const jsDow = jsDowOf(iso);
  const raw: Array<{ start: number; end: number }> = [];
  for (const u of unavail) {
    const matchRecurring = u.day_of_week != null && u.day_of_week === jsDow;
    const matchSpecific =
      u.date_specific != null &&
      iso >= u.date_specific &&
      iso <= (u.date_end ?? u.date_specific);
    if (!matchRecurring && !matchSpecific) continue;
    if (!u.start_time || !u.end_time) continue; // journée entière traitée ailleurs
    const s = timeToMin(u.start_time);
    const e = timeToMin(u.end_time);
    if (e > s) raw.push({ start: s, end: e });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}

/** Fenêtres LIBRES du jour = [0, 1440) moins les créneaux d'indispo partielle. */
function freeWindows(
  busy: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const wins: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const iv of busy) {
    if (iv.start > cursor) wins.push({ start: cursor, end: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < DAY_MIN) wins.push({ start: cursor, end: DAY_MIN });
  return wins;
}

/**
 * Longueur TOTALE (murale) d'un shift à `startMin` : heures travaillées + pauses.
 * Le vendredi, si la pause prière (verrouillée) chevauche le shift, elle FAIT
 * office de pause (durée prière) ; sinon on ajoute `pauseMin` (2 pauses réparties).
 * Doit rester COHÉRENT avec buildShift (même test de chevauchement prière).
 */
function shiftSpanMin(
  iso: string,
  startMin: number,
  workedMin: number,
  prayer: ProposalPrayerPause,
  pauseMin: number,
): number {
  let span = workedMin;
  const pw = prayerPauseForISO(iso, prayer);
  let prayerApplies = false;
  if (pw) {
    const pS = timeToMin(pw.start);
    const pE = timeToMin(pw.end);
    if (startMin < pE && startMin + workedMin > pS) {
      prayerApplies = true;
      span += pE - pS;
    }
  }
  if (!prayerApplies && pauseMin > 0) span += pauseMin;
  return span;
}

/**
 * Place ET construit un shift de `workedHours` sur `iso`, en respectant les
 * indispos partielles : on ESSAIE `desiredStartMin` (heure de début par défaut),
 * et si ça chevauche une indispo, on DÉCALE le début après la fin de l'indispo
 * (1re fenêtre libre assez large pour durée travaillée + pauses). Pas de
 * débordement après minuit. Retour null si aucune fenêtre n'est assez large
 * (ou jour bloqué / paramètres invalides) -> l'appelant SKIP le jour.
 *
 * PLAFOND DE FERMETURE : la FIN (start + travaillé + pauses) ne dépasse jamais
 * l'heure de fermeture du site (`siteClosingTime(siteCode, iso)`). Si le shift
 * plein déborde la fermeture, on ROGNE les heures travaillées de CE jour pour
 * finir pile à la fermeture (le reliquat repart sur les jours suivants côté
 * appelant). Si même un shift minimal ne tient pas avant la fermeture depuis le
 * début requis -> null (jour non couvert). La contrainte d'indispo (fenêtre qui
 * doit contenir le shift PLEIN) est inchangée : on ne rogne QUE pour la fermeture.
 */
function placeAndBuildShift(
  iso: string,
  desiredStartMin: number,
  workedHours: number,
  unavail: ProposalUnavailability[],
  prayer: ProposalPrayerPause,
  pauseMin: number,
  brabant: boolean,
  staggerRank: number,
  closingFor: ClosingResolver,
  minShiftMin: number = MIN_SHIFT_MIN,
): ProposalShift | null {
  if (isFullDayBlocked(iso, unavail)) return null;
  const workedMin = Math.round(workedHours * 60);
  if (workedMin <= 0) return null;
  // Plafond de fermeture du jour (borné à minuit par sécurité).
  const closingMin = Math.min(DAY_MIN, closingFor(iso));
  const wins = freeWindows(partialBusyIntervals(iso, unavail));
  for (const win of wins) {
    // On ne démarre jamais AVANT l'heure de début par défaut ; on ne fait que
    // décaler plus tard pour contourner une indispo antérieure.
    const start = Math.max(desiredStartMin, win.start);
    // Fin MAXIMALE possible dans cette fenêtre : bornée par l'indispo (win.end),
    // la fermeture du site et minuit.
    const hardEnd = Math.min(win.end, closingMin, DAY_MIN);
    if (start >= hardEnd) continue; // pas de place dans cette fenêtre depuis `start`
    // Pauses = offset FIXE (durée = span(worked) - worked). On ROGNE les heures
    // travaillées à ce qui tient avant `hardEnd` au lieu de rejeter le jour : un
    // shift trop long (ex. créneau fermeture) est simplement raccourci.
    const addition = shiftSpanMin(iso, start, workedMin, prayer, pauseMin) - workedMin;
    const placeMin = Math.min(workedMin, hardEnd - start - addition);
    if (placeMin < minShiftMin) continue; // sous le shift minimum conforme -> fenêtre suivante
    return buildShift(iso, start, placeMin / 60, prayer, pauseMin, brabant, staggerRank, closingFor);
  }
  return null;
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
  closingFor: ClosingResolver,
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

  // Garde-fou plafond de fermeture : la fin ne dépasse JAMAIS la fermeture du
  // site pour ce jour. En pratique un no-op (placeAndBuildShift dimensionne déjà
  // les heures pour tenir), mais protège tout appel direct / arrondi résiduel.
  const closingMin = Math.min(DAY_MIN, closingFor(iso));
  if (endMin > closingMin) endMin = closingMin;

  return {
    date: iso,
    start_time: minToTime(startMin),
    end_time: minToTime(endMin),
    hours: Number(workedHours.toFixed(2)),
    pause,
    breaks,
  };
}

// ── Jours CANDIDATS d'une fenêtre de 7 jours (hors OFF / indispo JOURNÉE) ─────
// Karim 2026-07-10 : un jour à indispo PARTIELLE reste CANDIDAT (le shift y sera
// décalé via placeAndBuildShift). Seuls OFF fixe et indispo JOURNÉE ENTIÈRE
// excluent le jour. Retour = dates ISO chronologiques.
function computeAvailableDays(
  weekStartISO: string,
  fixedOffDays: Set<number>,
  unavail: ProposalUnavailability[],
  notBeforeDate?: string | null, // Karim 2026-07-12 : aucun jour AVANT cette date
): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysISO(weekStartISO, i));
  const floor = notBeforeDate ? notBeforeDate.slice(0, 10) : null;
  return days.filter(
    (iso) =>
      (!floor || iso >= floor) &&
      !isFixedOff(iso, fixedOffDays) &&
      !isFullDayBlocked(iso, unavail),
  );
}

const MIN_SHIFT_MIN = 15; // plancher technique (fallback) : pas de micro-shift < 15 min

// ── Conformité belge (Karim 2026-07-11, corrigé 2026-07-12) ──────────────────
// AUCUN shift ne peut être inférieur à 3 h — POUR TOUS (y compris les étudiants :
// « le travailleur n'a pas le droit à moins de 3 heures »). Le minimum d'heures par
// SEMAINE (13 h) garde, lui, l'exemption étudiant (un étudiant peut totaliser moins
// d'heures) ; il est VÉRIFIÉ et signalé dans `reason` (jamais forcé en silence).
const CONFORM_MIN_SHIFT_MIN = 3 * 60; // 3 h — shift minimum conforme (TOUS)
const MIN_WEEKLY_HOURS = 13; // minimum légal d'heures/semaine (hors étudiant)

// ── Remplissage SÉQUENTIEL d'UNE semaine, curseur horaire A -> B -> C ─────────
// Karim 2026-07-11 : les variantes forment un FLUX D'HEURES CONTINU. B reprend
// EXACTEMENT au jour ET à l'heure où A s'arrête (ex. A finit lundi 15:15 -> B
// commence lundi 15:15), C reprend où B s'arrête. On maintient donc un CURSEUR
// (jour dispo + heure) qui avance à travers la semaine, et chaque variante y
// consomme `weeklyHours` de travail.
//
// Règles :
//  - un travailleur fait AU PLUS un shift par jour DANS une variante ;
//  - si une variante atteint son quota EN MILIEU DE JOURNÉE (avant la fermeture),
//    le curseur reste sur ce jour à l'heure de fin -> la variante SUIVANTE
//    enchaîne le même jour à cette heure (c'est le « handoff » lundi 15:15) ;
//  - si le shift atteint la fermeture, on passe au jour dispo suivant (heure de
//    début par défaut) ;
//  - les jours OFF / indispo JOURNÉE sont déjà exclus ; une indispo PARTIELLE
//    décale le shift (placeAndBuildShift).
// Retour = un ProposalWeek par variante (index 0 = A, 1 = B, 2 = C).
function fillWeekSequential(args: {
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
  closingFor: ClosingResolver;
  numVariants: number;
  minShiftMin: number; // shift minimum conforme (3 h non-étudiant, plus bas étudiant)
  notBeforeDate: string | null; // aucun jour proposé avant cette date
}): ProposalWeek[] {
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
    closingFor,
    numVariants,
    minShiftMin,
    notBeforeDate,
  } = args;
  const minShiftH = minShiftMin / 60;

  const available = computeAvailableDays(weekStartISO, fixedOffDays, unavail, notBeforeDate);
  const perVariant: ProposalShift[][] = Array.from({ length: numVariants }, () => []);
  const EPS = 0.25; // 15 min : ni quota résiduel ni shift en dessous.

  let dayIdx = 0;
  let cursor = startMin; // heure de début sur le jour courant (available[dayIdx % n])

  // Karim 2026-07-11 (RÈGLE FERME) : le flux séquentiel est CONSERVÉ (chaque variante
  // reprend au jour+heure EXACTS où la précédente s'arrête), MAIS chaque variante doit
  // couvrir 100 % du quota. Quand le curseur atteint la fin de la semaine sans avoir
  // rempli le quota, il ENROULE sur le début de la semaine (jours non encore utilisés
  // PAR CETTE variante) jusqu'à compléter le quota. Aucune variante d'appoint.
  for (let v = 0; v < numVariants; v++) {
    let remaining = weeklyHours;
    const usedDays = new Set<string>(); // jours déjà pris DANS cette variante
    const maxSteps = available.length * 2 + 4; // garde-fou anti-boucle
    let steps = 0;
    while (remaining > EPS && available.length > 0 && steps < maxSteps) {
      steps++;
      const iso = available[dayIdx % available.length];
      if (usedDays.has(iso)) {
        // Jour déjà utilisé par CETTE variante -> jour suivant (enroulement).
        dayIdx++;
        cursor = startMin;
        continue;
      }
      let want = Math.min(remaining, shiftHours);
      // Conformité : ne pas laisser de reliquat sous le shift minimum (sinon la
      // dernière prestation serait < 3 h). On raccourcit ce shift pour que le reste
      // soit nul OU ≥ au minimum conforme.
      const leftover = remaining - want;
      if (leftover > EPS && leftover < minShiftH) {
        const adj = remaining - minShiftH;
        if (adj >= minShiftH) want = adj;
      }
      if (want < EPS) break;

      // Karim 2026-07-11 : PAUSE VENDREDI. Un PETIT shift du vendredi qui tient
      // entièrement APRÈS la pause prière (fermeture hebdo de ce jour) est démarré
      // APRÈS celle-ci (on évite un mini-shift du matin coupé par la prière).
      let desiredStart = cursor;
      const pw = prayer.enabled ? prayerPauseForISO(iso, prayer) : null;
      if (pw) {
        const pauseEndMin = timeToMin(pw.end);
        const closeMin = Math.min(DAY_MIN, closingFor(iso));
        const wm = Math.round(want * 60);
        if (
          cursor <= pauseEndMin &&
          pauseEndMin + shiftSpanMin(iso, pauseEndMin, wm, prayer, pauseMin) <= closeMin
        ) {
          desiredStart = pauseEndMin;
        }
      }

      const shift = placeAndBuildShift(
        iso,
        desiredStart,
        want,
        unavail,
        prayer,
        pauseMin,
        brabant,
        staggerRank,
        closingFor,
        minShiftMin,
      );
      if (!shift) {
        // Fenêtre trop courte depuis le curseur -> jour suivant, début par défaut.
        dayIdx++;
        cursor = startMin;
        continue;
      }
      perVariant[v].push(shift);
      usedDays.add(iso);
      remaining -= shift.hours;
      const endMin = timeToMin(shift.end_time);
      const closingMin = Math.min(DAY_MIN, closingFor(iso));
      const reachedClosing = endMin >= closingMin - 1;
      if (remaining <= EPS && !reachedClosing) {
        // Quota atteint EN MILIEU DE JOURNÉE : le curseur reste ici -> la variante
        // suivante enchaîne CE jour à cette heure (handoff exact = mode séquentiel).
        cursor = endMin;
        break;
      }
      // Jour « consommé » (fermeture atteinte ou shift plein posé) -> jour suivant.
      dayIdx++;
      cursor = startMin;
    }
  }

  return perVariant.map((shifts) => {
    shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const total = shifts.reduce((s, x) => s + x.hours, 0);
    return {
      week_index: weekIndex,
      week_start: weekStartISO,
      week_end: addDaysISO(weekStartISO, 6),
      shifts,
      total_hours: Number(total.toFixed(2)),
    };
  });
}

/** Assemble une variante à partir de ses semaines déjà remplies. */
function mkVariant(
  label: string,
  strategy: string,
  weeksArr: ProposalWeek[],
): ProposalVariant {
  const total = weeksArr.reduce((s, w) => s + w.total_hours, 0);
  return { label, strategy, weeks: weeksArr, total_hours: Number(total.toFixed(2)) };
}

const COVERAGE_TOTAL_CAP = 12; // A..L max


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
  /** Code du SITE PRINCIPAL du travailleur (ex. "A", "B"…) — utilisé UNIQUEMENT
   *  comme FALLBACK (règle en dur `siteClosingTime`) quand `siteClosings` n'a pas
   *  de valeur pour un jour donné. null/absent -> défaut « autres sites »
   *  (20:00 week-end, 19:30 en semaine). */
  siteCode?: string | null;
  /** Fermeture DÉRIVÉE de `site_needs` : map jsDow (0=Dim..6=Sam) -> "HH:MM"
   *  (= max des `end_time` du site ce jour, plafonné à 20:00), construite par le
   *  store. Prioritaire sur `siteCode`. Jours absents -> fallback règle en dur. */
  siteClosings?: Record<number, string> | null;
  /** Travailleur ÉTUDIANT (contract_type ~ "Étudiant") : autorise les mini-shifts
   *  (< 3 h) et exempte du minimum de 13 h/semaine. Défaut false = régime conforme
   *  (shift ≥ 3 h, min 13 h/sem signalé). */
  isStudent?: boolean;
  /** Karim 2026-07-12 : PLANCHER de date — aucun jour proposé AVANT cette date
   *  ("YYYY-MM-DD"). = max(date sélectionnée à la génération, début de contrat). Le
   *  1er jour d'une semaine calée au lundi ne peut donc pas être antérieur à ce jour. */
  notBeforeDate?: string | null;
}): PlanningProposal {
  const weeks = input.weeks ?? 3;
  const isStudent = input.isStudent === true;
  const notBefore = input.notBeforeDate ? input.notBeforeDate.slice(0, 10) : null;
  // Shift minimum conforme : 3 h POUR TOUS (étudiants compris). L'exemption étudiant
  // ne concerne QUE le minimum d'heures/semaine (13 h), pas la durée d'un shift.
  const minShiftMin = CONFORM_MIN_SHIFT_MIN;
  const prayer = input.prayerPause ?? DEFAULT_PROPOSAL_PRAYER_PAUSE;
  const fixedOffDays = new Set<number>((input.fixedOffDays ?? []).filter((n) => n >= 0 && n <= 6));
  const unavail = input.unavailabilities ?? [];
  const pauseMin = Math.max(0, Math.round(Number(input.pauseMinutes ?? 30) || 0));
  const brabant = input.brabant === true;
  const staggerRank = Number.isInteger(input.staggerRank) ? (input.staggerRank as number) : 0;
  const siteCode = input.siteCode ?? null;

  // Résolveur de fermeture : la valeur `site_needs` du jour (map injectée par le
  // store) prime ; à défaut, on retombe sur la RÈGLE EN DUR par site/jour. Plafond
  // absolu 20:00 dans tous les cas (belt-and-suspenders, la map est déjà plafonnée).
  const siteClosings = input.siteClosings ?? null;
  const closingFor: ClosingResolver = (iso) => {
    const hhmm = siteClosings?.[jsDowOf(iso)];
    const min = hhmm != null ? timeToMin(hhmm) : siteClosingMinutes(siteCode, iso);
    return Math.min(ABSOLUTE_CLOSING_MIN, min);
  };

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
      variants_extra: [],
      reason: `Proposition non générée : renseigne ${missing.join(", ")} sur la fiche.`,
    };
  }

  const startMin = timeToMin(startTime!);

  // Karim 2026-07-11 (RÈGLE FERME) : TOUTES les variantes sont issues du FLUX
  // SÉQUENTIEL (B reprend au jour+heure EXACTS où A s'arrête, C au bout de B, etc.)
  // ET couvrent CHACUNE 100 % du quota hebdomadaire (enroulement si besoin). Il n'y a
  // AUCUNE variante d'appoint/partielle. On en génère assez pour tuiler toute la
  // semaine disponible (davantage de choix pour les petits volumes), plafond 12.
  const week0Avail = computeAvailableDays(input.startDate, fixedOffDays, unavail, notBefore);
  // Karim 2026-07-12 : la durée EFFECTIVE d'un shift n'est PAS bloquée au shift par
  // défaut. Elle est (a) au moins 3 h (conforme), (b) au moins ce qu'il faut pour
  // ATTEINDRE LE QUOTA sur les jours dispos (`weeklyHours / jours dispos`) — sinon un
  // temps plein à 6 h de shift sur 6 jours plafonnerait à 36 h au lieu de 38 h. Bornée
  // à ~9,5 h (fenêtre max d'un magasin) ; le plafond de fermeture rogne au besoin.
  const daysForQuota = Math.max(1, week0Avail.length);
  const effShiftHours = Math.min(
    9.5,
    Math.max(shiftHours, minShiftMin / 60, weeklyHours / daysForQuota),
  );
  const capacityH = week0Avail.length * effShiftHours; // capacité approx. de la semaine
  // +1 : une variante de plus que le strict « tuilage » pour offrir un choix
  // supplémentaire (le dédoublonnage retire ensuite les doublons exacts).
  const numVariants = Math.min(
    COVERAGE_TOTAL_CAP,
    Math.max(3, weeklyHours > 0 ? Math.ceil(capacityH / weeklyHours) + 1 : 3),
  );

  const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const strategyFor = (i: number): string =>
    i === 0
      ? "Premières heures disponibles (remplit le quota à partir du 1er jour dispo)"
      : `Suite exacte de ${LABELS[i - 1]} : reprend au jour et à l'heure où ${LABELS[i - 1]} s'arrête (100 % du quota)`;

  // Remplit chaque semaine avec N variantes séquentielles, puis assemble par variante.
  const weeksByVariant: ProposalWeek[][] = Array.from({ length: numVariants }, () => []);
  for (let w = 0; w < weeks; w++) {
    const weekStartISO = addDaysISO(input.startDate, w * 7);
    const seq = fillWeekSequential({
      weekIndex: w,
      weekStartISO,
      weeklyHours,
      startMin,
      shiftHours: effShiftHours,
      fixedOffDays,
      unavail,
      prayer,
      pauseMin,
      brabant,
      staggerRank,
      closingFor,
      numVariants,
      minShiftMin,
      notBeforeDate: notBefore,
    });
    seq.forEach((week, v) => weeksByVariant[v].push(week));
  }

  // Assemble, puis DÉDUPLIQUE les variantes identiques (même suite exacte de shifts).
  const allVariants: ProposalVariant[] = [];
  const seenSig = new Set<string>();
  for (let i = 0; i < numVariants; i++) {
    const v = mkVariant(LABELS[i] ?? `V${i + 1}`, strategyFor(i), weeksByVariant[i]);
    if ((v.weeks[0]?.shifts.length ?? 0) === 0) continue; // variante vide -> ignorer
    const sig = JSON.stringify(
      v.weeks.map((wk) => wk.shifts.map((s) => `${s.date}|${s.start_time}|${s.end_time}`)),
    );
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    allVariants.push(v);
  }
  // Ré-étiquette A, B, C… dans l'ordre après dédup.
  allVariants.forEach((v, i) => {
    v.label = LABELS[i] ?? `V${i + 1}`;
    v.strategy = strategyFor(i);
  });
  // Le type garantit A/B/C : si la dédup a trop réduit (aucune marge), complète.
  while (allVariants.length < 3) {
    allVariants.push(emptyVariant(LABELS[allVariants.length] ?? `V${allVariants.length + 1}`));
  }

  const variantA = allVariants[0];
  const variantB = allVariants[1];
  const variantC = allVariants[2];
  const variants_extra = allVariants.slice(3);

  // Raison best-effort : semaines partielles (jours dispo insuffisants) ou peu de marge.
  const reasons: string[] = [];
  const anyPartial = allVariants.some((v) =>
    v.weeks.some((wk) => wk.shifts.length > 0 && wk.total_hours < weeklyHours - 0.5),
  );
  if (anyPartial) {
    reasons.push(
      "Certaines variantes n'atteignent pas le quota (pas assez de jours disponibles après OFF / indispos).",
    );
  }
  const distinct = allVariants.filter((v) => (v.weeks[0]?.shifts.length ?? 0) > 0).length;
  if (distinct < 2) {
    reasons.push(
      "Une seule variante distincte : aucune marge (jours disponibles = jours nécessaires).",
    );
  }
  // Conformité : minimum légal de 13 h/semaine (hors étudiant). On SIGNALE, on ne
  // force jamais (le contrat reste la source de vérité — à corriger côté admin).
  if (!isStudent && weeklyHours > 0 && weeklyHours < MIN_WEEKLY_HOURS) {
    reasons.push(
      `⚠️ Conformité : ${weeklyHours} h/semaine est sous le minimum légal de ${MIN_WEEKLY_HOURS} h (hors étudiant) — à vérifier/corriger sur le contrat.`,
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
    variants_extra,
    reason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}
