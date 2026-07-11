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
    if (start >= win.end) continue; // fenêtre entièrement avant le début souhaité
    const span = shiftSpanMin(iso, start, workedMin, prayer, pauseMin);
    if (start + span <= win.end && start + span <= DAY_MIN) {
      // La fenêtre (indispos) contient le shift PLEIN. On applique le plafond de
      // fermeture : si la fin dépasse la fermeture, on réduit les heures pour
      // finir à la fermeture (pauses = offset FIXE, donc rognage direct sur le
      // travaillé). `addition` = durée des pauses ajoutées à la fin.
      if (start >= closingMin) return null; // fermé avant même de démarrer
      const addition = span - workedMin;
      let placeMin = workedMin;
      if (start + span > closingMin) {
        placeMin = closingMin - start - addition;
      }
      // Trop peu de marge avant la fermeture pour un vrai shift depuis ce début.
      if (placeMin < MIN_SHIFT_MIN) return null;
      return buildShift(iso, start, placeMin / 60, prayer, pauseMin, brabant, staggerRank, closingFor);
    }
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
): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysISO(weekStartISO, i));
  return days.filter(
    (iso) => !isFixedOff(iso, fixedOffDays) && !isFullDayBlocked(iso, unavail),
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
  closingFor: ClosingResolver;
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
    closingFor,
  } = args;

  const capMin = Math.round(shiftHours * 60);
  const targetMin = Math.round(weeklyHours * 60);
  const available = computeAvailableDays(weekStartISO, fixedOffDays, unavail);

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
    // Décale le shift après une éventuelle indispo partielle du jour ; si aucune
    // fenêtre n'est assez large, le jour est simplement non couvert (best-effort).
    const shift = placeAndBuildShift(
      iso,
      startMin,
      workedMin / 60,
      unavail,
      prayer,
      pauseMin,
      brabant,
      staggerRank,
      closingFor,
    );
    if (shift) shifts.push(shift);
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

/** Nombre de jours nécessaires pour couvrir le quota hebdo (1 shift plein/jour).
 *  Sert au diagnostic « A et B couvrent-elles déjà toute la dispo ? ». */
function daysNeeded(weeklyHours: number, shiftHours: number): number {
  if (shiftHours <= 0) return 1;
  return Math.max(1, Math.ceil(weeklyHours / shiftHours - 1e-9));
}

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
  numVariants: number; // 2 (C = alternative ailleurs) ou 3
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
  } = args;

  const available = computeAvailableDays(weekStartISO, fixedOffDays, unavail);
  const perVariant: ProposalShift[][] = Array.from({ length: numVariants }, () => []);
  const EPS = 0.25; // 15 min : ni quota résiduel ni shift en dessous.

  let dayIdx = 0;
  let cursor = startMin; // heure de début sur le jour courant (available[dayIdx])

  for (let v = 0; v < numVariants; v++) {
    let remaining = weeklyHours;
    while (remaining > EPS && dayIdx < available.length) {
      const iso = available[dayIdx];
      const want = Math.min(remaining, shiftHours);
      if (want < EPS) break;
      const shift = placeAndBuildShift(
        iso,
        cursor,
        want,
        unavail,
        prayer,
        pauseMin,
        brabant,
        staggerRank,
        closingFor,
      );
      if (!shift) {
        // Fenêtre trop courte depuis le curseur -> jour suivant, début par défaut.
        dayIdx++;
        cursor = startMin;
        continue;
      }
      perVariant[v].push(shift);
      remaining -= shift.hours;
      const endMin = timeToMin(shift.end_time);
      const closingMin = Math.min(DAY_MIN, closingFor(iso));
      const reachedClosing = endMin >= closingMin - 1;
      if (remaining <= EPS && !reachedClosing) {
        // Quota atteint EN MILIEU DE JOURNÉE : le curseur reste ici -> la variante
        // suivante enchaîne CE jour à cette heure (handoff exact).
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
  label: "A" | "B" | "C",
  strategy: string,
  weeksArr: ProposalWeek[],
): ProposalVariant {
  const total = weeksArr.reduce((s, w) => s + w.total_hours, 0);
  return { label, strategy, weeks: weeksArr, total_hours: Number(total.toFixed(2)) };
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
  closingFor: ClosingResolver;
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
      closingFor: args.closingFor,
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
  /** Code du SITE PRINCIPAL du travailleur (ex. "A", "B"…) — utilisé UNIQUEMENT
   *  comme FALLBACK (règle en dur `siteClosingTime`) quand `siteClosings` n'a pas
   *  de valeur pour un jour donné. null/absent -> défaut « autres sites »
   *  (20:00 week-end, 19:30 en semaine). */
  siteCode?: string | null;
  /** Fermeture DÉRIVÉE de `site_needs` : map jsDow (0=Dim..6=Sam) -> "HH:MM"
   *  (= max des `end_time` du site ce jour, plafonné à 20:00), construite par le
   *  store. Prioritaire sur `siteCode`. Jours absents -> fallback règle en dur. */
  siteClosings?: Record<number, string> | null;
}): PlanningProposal {
  const weeks = input.weeks ?? 3;
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
      reason: `Proposition non générée : renseigne ${missing.join(", ")} sur la fiche.`,
    };
  }

  const startMin = timeToMin(startTime!);

  // Karim 2026-07-11 : A/B/C = FLUX D'HEURES CONTINU. B reprend au jour+heure EXACTS
  // où A s'arrête (ex. A finit lundi 15:15 -> B commence lundi 15:15), C où B s'arrête.
  // SAUF si A et B couvrent DÉJÀ toute la disponibilité de la semaine : alors C
  // devient une variante ALTERNATIVE (répartie sur la semaine) qui peut mieux convenir.
  const dpw = daysNeeded(weeklyHours, shiftHours);
  const reprAvailable = computeAvailableDays(input.startDate, fixedOffDays, unavail).length;
  const abCoverAll = reprAvailable > 0 && 2 * dpw >= reprAvailable;
  const numSeq = abCoverAll ? 2 : 3;

  // Remplissage séquentiel semaine par semaine (le curseur horaire est propre à
  // chaque semaine : chaque semaine repart de son 1er jour dispo).
  const weeksA: ProposalWeek[] = [];
  const weeksB: ProposalWeek[] = [];
  const weeksC: ProposalWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const res = fillWeekSequential({
      weekIndex: w,
      weekStartISO: addDaysISO(input.startDate, w * 7),
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
      numVariants: numSeq,
    });
    weeksA.push(res[0]);
    weeksB.push(res[1]);
    if (!abCoverAll) weeksC.push(res[2]);
  }

  const variantA = mkVariant(
    "A",
    "Premières heures disponibles (remplit le quota à partir du 1er jour dispo)",
    weeksA,
  );
  const variantB = mkVariant(
    "B",
    "Suite exacte de A : reprend au jour et à l'heure où A s'arrête",
    weeksB,
  );

  // C : suite exacte de B si des heures restent ; sinon variante répartie alternative.
  let variantC: ProposalVariant;
  let cReducedMicro = false;
  if (abCoverAll) {
    const c = buildVariantC({
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
      closingFor,
    });
    variantC = c.variant;
    cReducedMicro = c.reducedMicro;
  } else {
    variantC = mkVariant(
      "C",
      "Suite exacte de B : reprend au jour et à l'heure où B s'arrête",
      weeksC,
    );
  }

  // Raison best-effort : proposition partielle (jours dispo insuffisants) ou
  // variantes identiques (pas de marge : jours dispo = jours nécessaires).
  const reasons: string[] = [];
  // Tolérance 0.5h : le handoff horaire (A->B) peut laisser ~15 min de reliquat
  // sans que ce soit une vraie semaine partielle. On ne signale que A et B (C est
  // la QUEUE du flux, naturellement plus courte : ce n'est pas une anomalie).
  const anyPartial = [...variantA.weeks, ...variantB.weeks].some(
    (w) => w.total_hours < weeklyHours - 0.5,
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
  if (abCoverAll) {
    reasons.push(
      "A et B couvrent déjà toute la disponibilité : la variante C est une alternative répartie sur la semaine.",
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
