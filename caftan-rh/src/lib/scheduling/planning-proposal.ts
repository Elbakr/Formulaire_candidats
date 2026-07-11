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

const MIN_SHIFT_MIN = 15; // pas de micro-shift < 15 min

// ── Heures de pointe (variante C, phase 2) ───────────────────────────────────
// Karim 2026-07-11 : après avoir comblé les jours DÉCLARÉS DISPO oubliés par A et
// B, la variante C place le RESTE des heures sur les HEURES DE POINTE : 14:00–18:30
// en général, mais en ÉTÉ (juin–août) la pointe démarre plus tard (~15:00).
const PEAK_END_MIN = 18 * 60 + 30; // fin de pointe 18:30

/** Heure de début de pointe (minutes) selon la saison de la date. */
function peakStartMin(iso: string): number {
  const month = Number(iso.slice(5, 7));
  const summer = month >= 6 && month <= 8; // juin–août
  return summer ? 15 * 60 : 14 * 60; // été 15:00, sinon 14:00
}

/** Ordonne les jours dispos : WEEK-END d'abord (samedi/dimanche = pointe commerce),
 *  puis la semaine, chronologiquement. */
function orderPeakDays(available: string[]): string[] {
  const weekend = available.filter((d) => {
    const w = jsDowOf(d);
    return w === 0 || w === 6;
  });
  const week = available.filter((d) => {
    const w = jsDowOf(d);
    return w !== 0 && w !== 6;
  });
  return [...weekend, ...week];
}

// ── Variante C : combler les dispos oubliées par A/B, puis heures de pointe ───
// Karim 2026-07-11 : C a un DOUBLE rôle, dans cet ordre de priorité :
//   1) COMPLÉTER les jours déclarés dispos que NI A NI B ne reprennent (ex. le
//      jeudi de Salima) — aucune disponibilité déclarée ne doit être gaspillée ;
//   2) répartir le RESTE du quota sur les HEURES DE POINTE (week-end d'abord),
//      shift démarrant à 14:00 (été 15:00), fin plafonnée à 18:30 (et à la
//      fermeture réelle du site).
// Un même jour n'est pas utilisé deux fois dans C.
function fillWeekVariantC(args: {
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
  /** Jours déjà couverts par A OU B (on comble le reste en priorité). */
  usedABDates: Set<string>;
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
    pauseMin,
    brabant,
    staggerRank,
    closingFor,
    usedABDates,
  } = args;

  const available = computeAvailableDays(weekStartISO, fixedOffDays, unavail);
  const EPS = 0.25;
  const shifts: ProposalShift[] = [];
  const usedC = new Set<string>();
  let remaining = weeklyHours;

  // Phase 1 : combler les jours déclarés dispos oubliés par A ET B (chronologique).
  const missing = available.filter((d) => !usedABDates.has(d));
  for (const iso of missing) {
    if (remaining <= EPS) break;
    const want = Math.min(shiftHours, remaining);
    const shift = placeAndBuildShift(
      iso, startMin, want, unavail, prayer, pauseMin, brabant, staggerRank, closingFor,
    );
    if (shift) {
      shifts.push(shift);
      usedC.add(iso);
      remaining -= shift.hours;
    }
  }

  // Phase 2 : le reste des heures sur les HEURES DE POINTE (fermeture resserrée à
  // 18:30). Week-end d'abord ; on saute les jours déjà pris par la phase 1.
  if (remaining > EPS) {
    const peakClosing: ClosingResolver = (d) => Math.min(closingFor(d), PEAK_END_MIN);
    for (const iso of orderPeakDays(available)) {
      if (remaining <= EPS) break;
      if (usedC.has(iso)) continue;
      const want = Math.min(shiftHours, remaining);
      const shift = placeAndBuildShift(
        iso, peakStartMin(iso), want, unavail, prayer, pauseMin, brabant, staggerRank, peakClosing,
      );
      if (shift) {
        shifts.push(shift);
        usedC.add(iso);
        remaining -= shift.hours;
      }
    }
  }

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
  label: string,
  strategy: string,
  weeksArr: ProposalWeek[],
): ProposalVariant {
  const total = weeksArr.reduce((s, w) => s + w.total_hours, 0);
  return { label, strategy, weeks: weeksArr, total_hours: Number(total.toFixed(2)) };
}

// ── Variants d'appoint : COUVERTURE ouverture→fermeture (petits contrats) ─────
// Karim 2026-07-11 : quand A/B/C ne suffisent pas à couvrir toute la plage
// 10:15 → fermeture (souvent le cas des petits volumes/semaine), on génère AUTANT
// de variants supplémentaires (D, E, F…) que nécessaire pour que l'UNION des
// variants couvre chaque jour ouvré du MATIN (ouverture) au SOIR (fermeture cible :
// 19:45 si site principal = A, sinon fermeture du site). Ainsi l'étudiant a un
// maximum de créneaux accessibles. Garde-fou : 12 variants au total.
const OPEN_MIN = 10 * 60 + 15; // 10:15 — ouverture magasin (globalisée)
const COVERAGE_TOTAL_CAP = 12; // A..L max

function buildCoverageExtras(args: {
  startDate: string;
  weeks: number;
  weeklyHours: number;
  shiftHours: number;
  fixedOffDays: Set<number>;
  unavail: ProposalUnavailability[];
  prayer: ProposalPrayerPause;
  pauseMin: number;
  brabant: boolean;
  staggerRank: number;
  closingFor: ClosingResolver;
  siteCode: string | null;
  base: ProposalVariant[]; // A/B/C déjà générés
}): ProposalVariant[] {
  const {
    startDate, weeks, weeklyHours, shiftHours, fixedOffDays, unavail,
    prayer, pauseMin, brabant, staggerRank, closingFor, siteCode, base,
  } = args;
  if (weeklyHours <= 0 || shiftHours <= 0) return [];

  const isSiteA = (siteCode ?? "").trim().toUpperCase() === "A";
  // Fermeture CIBLE de couverture : 19:45 pour un site A par défaut, sinon la
  // fermeture réelle du site (site_needs / règle en dur), plafonnée à minuit.
  const coverageClose = (iso: string): number =>
    isSiteA ? timeToMin("19:45") : Math.min(DAY_MIN, closingFor(iso));

  const openDays = computeAvailableDays(startDate, fixedOffDays, unavail); // semaine 0 (référence)

  // Shifts A/B/C sur la semaine 0, indexés par date (pour repérer le déjà-couvert).
  const byDate = new Map<string, ProposalShift[]>();
  for (const v of base) {
    for (const s of v.weeks[0]?.shifts ?? []) {
      const a = byDate.get(s.date) ?? [];
      a.push(s);
      byDate.set(s.date, a);
    }
  }

  // Ancres NON couvertes : par jour ouvré, un créneau MATIN (ouverture) et si besoin
  // un créneau FERMETURE, seulement s'ils ne sont pas déjà couverts par A/B/C.
  type Anchor = { dayOffset: number; kind: "morning" | "closing" };
  const workedMinFull = Math.round(shiftHours * 60);
  const anchors: Anchor[] = [];
  for (const iso of openDays) {
    const dayOffset = Math.round(
      (Date.parse(iso + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86_400_000,
    );
    const closeMin = coverageClose(iso);
    const dayShifts = byDate.get(iso) ?? [];

    if (!dayShifts.some((s) => timeToMin(s.start_time) <= OPEN_MIN + 60)) {
      anchors.push({ dayOffset, kind: "morning" });
    }
    const morningSpan = shiftSpanMin(iso, OPEN_MIN, workedMinFull, prayer, pauseMin);
    if (OPEN_MIN + morningSpan < closeMin - 15) {
      if (!dayShifts.some((s) => timeToMin(s.end_time) >= closeMin - 60)) {
        anchors.push({ dayOffset, kind: "closing" });
      }
    }
  }
  if (anchors.length === 0) return [];

  const maxExtra = Math.max(0, COVERAGE_TOTAL_CAP - base.length);
  if (maxExtra === 0) return [];

  // Bin-packing : UN SEUL shift par jour et par variant, remplit ~quota hebdo par
  // variant. On ne met jamais deux créneaux du même jour dans la même variante
  // (un travailleur ne fait pas 2 shifts/jour) — ils vont dans des variantes
  // différentes, de sorte que l'UNION couvre matin ET fermeture de chaque jour.
  type Bundle = { items: Array<Anchor & { worked: number }>; rem: number; days: Set<number> };
  const bundles: Bundle[] = [];
  for (const a of anchors) {
    let placed = false;
    for (const b of bundles) {
      if (b.rem >= 0.25 && !b.days.has(a.dayOffset)) {
        const worked = Math.min(shiftHours, b.rem);
        b.items.push({ ...a, worked });
        b.rem -= worked;
        b.days.add(a.dayOffset);
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (bundles.length >= maxExtra) break; // plafond atteint -> best-effort
      const worked = Math.min(shiftHours, weeklyHours);
      bundles.push({ items: [{ ...a, worked }], rem: weeklyHours - worked, days: new Set([a.dayOffset]) });
    }
  }

  const LABELS = ["D", "E", "F", "G", "H", "I", "J", "K", "L"];
  return bundles.slice(0, maxExtra).map((bundle, i) => {
    const weeksArr: ProposalWeek[] = [];
    for (let w = 0; w < weeks; w++) {
      const ws = addDaysISO(startDate, w * 7);
      const shifts: ProposalShift[] = [];
      for (const it of bundle.items) {
        const iso = addDaysISO(ws, it.dayOffset);
        const wm = Math.round(it.worked * 60);
        // MATIN : démarre à l'ouverture. FERMETURE : démarre pour FINIR à la
        // fermeture cible (calé sur les heures réelles de ce créneau).
        let startMin = OPEN_MIN;
        if (it.kind === "closing") {
          const closeMin = coverageClose(iso);
          const span = shiftSpanMin(iso, Math.max(OPEN_MIN, closeMin - wm), wm, prayer, pauseMin);
          startMin = Math.max(OPEN_MIN, closeMin - span);
        }
        const shift = placeAndBuildShift(
          iso, startMin, it.worked, unavail, prayer, pauseMin, brabant, staggerRank,
          (d) => coverageClose(d),
        );
        if (shift) shifts.push(shift);
      }
      shifts.sort((x, y) =>
        x.date < y.date ? -1 : x.date > y.date ? 1 : x.start_time < y.start_time ? -1 : 1,
      );
      weeksArr.push({
        week_index: w,
        week_start: ws,
        week_end: addDaysISO(ws, 6),
        shifts,
        total_hours: Number(shifts.reduce((s, x) => s + x.hours, 0).toFixed(2)),
      });
    }
    return mkVariant(LABELS[i] ?? `V${base.length + i + 1}`, "Créneaux d'appoint pour couvrir l'ouverture→fermeture", weeksArr);
  });
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
      variants_extra: [],
      reason: `Proposition non générée : renseigne ${missing.join(", ")} sur la fiche.`,
    };
  }

  const startMin = timeToMin(startTime!);

  // Karim 2026-07-11 : A et B = FLUX D'HEURES CONTINU (B reprend au jour+heure
  // EXACTS où A s'arrête, ex. A finit lundi 15:15 -> B commence lundi 15:15).
  // C a un DOUBLE rôle : (1) COMPLÉTER les jours déclarés dispos qu'aucune des deux
  // ne reprend (ex. le jeudi de Salima), puis (2) répartir le reste sur les HEURES
  // DE POINTE (14:00 / été 15:00 -> 18:30, week-end d'abord).
  const weeksA: ProposalWeek[] = [];
  const weeksB: ProposalWeek[] = [];
  const weeksC: ProposalWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekStartISO = addDaysISO(input.startDate, w * 7);
    const seq = fillWeekSequential({
      weekIndex: w,
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
      numVariants: 2, // A et B ; C est construite à part (comblement + pointe)
    });
    const weekA = seq[0];
    const weekB = seq[1];
    weeksA.push(weekA);
    weeksB.push(weekB);

    const usedABDates = new Set<string>([
      ...weekA.shifts.map((s) => s.date),
      ...weekB.shifts.map((s) => s.date),
    ]);
    weeksC.push(
      fillWeekVariantC({
        weekIndex: w,
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
        usedABDates,
      }),
    );
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
  const variantC = mkVariant(
    "C",
    "Complète les jours dispos oubliés par A/B, puis heures de pointe (14:00 / été 15:00 – 18:30)",
    weeksC,
  );

  // Raison best-effort : proposition partielle (jours dispo insuffisants) ou
  // variantes identiques (pas de marge : jours dispo = jours nécessaires).
  const reasons: string[] = [];
  // Tolérance 0.5h : le handoff horaire (A->B) peut laisser ~15 min de reliquat
  // sans que ce soit une vraie semaine partielle. On ne signale que A et B (C est
  // la variante de complément/pointe, dont la longueur dépend du reste à couvrir).
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

  // Karim 2026-07-11 : si A/B/C ne couvrent pas toute la plage ouverture→fermeture
  // (petits contrats), on ajoute AUTANT de variants d'appoint (D, E, F…) que
  // nécessaire pour couvrir chaque jour ouvré du matin au soir. Vide si déjà couvert.
  const variants_extra = buildCoverageExtras({
    startDate: input.startDate,
    weeks,
    weeklyHours,
    shiftHours,
    fixedOffDays,
    unavail,
    prayer,
    pauseMin,
    brabant,
    staggerRank,
    closingFor,
    siteCode,
    base: [variantA, variantB, variantC],
  });
  if (variants_extra.length > 0) {
    reasons.push(
      `${variants_extra.length} variant(s) d'appoint ajouté(s) pour couvrir l'ouverture→fermeture (petit volume horaire).`,
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
