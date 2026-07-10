// site-hours.ts — HORAIRES DE FERMETURE par site + jour (helper PUR, sans DB).
//
// Karim 2026-07-10 : la journée se termine au PLUS TARD à 20:00 partout.
//   - Magasin A : ferme à 20:00 TOUS les jours (7/7).
//   - Autres sites (B, C, D, E, F…) : 20:00 le samedi ET le dimanche,
//     19:30 du lundi au vendredi.
// Ce plafond s'APPLIQUE à la fin des shifts proposés par le moteur de planning
// (planning-proposal.ts) : un shift ne peut jamais finir après la fermeture.
//
// SOURCE / discordance connue : la table `site_needs` encode déjà des créneaux
// d'effectif avec `end_time` (la fermeture de fait = le end_time max du jour).
// La règle ci-dessous est la source de vérité MÉTIER énoncée par Karim ; elle
// DIVERGE de `site_needs` pour C (19:00) et F (18:45). Tant que Karim n'a pas
// tranché, on applique SA règle explicite (défaut en dur) et on signale l'écart.

const ABSOLUTE_CLOSING = "20:00"; // plafond absolu, jamais dépassé nulle part.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** getDay() JS (0=Dim..6=Sam) d'une date civile "YYYY-MM-DD", stable en UTC. */
function jsDowOfISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

/** Minutes depuis minuit d'un "HH:MM". */
function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Heure de fermeture "HH:MM" d'un site pour une date donnée.
 *  - `A`            -> "20:00" tous les jours.
 *  - autres / null  -> "20:00" samedi+dimanche, "19:30" lundi-vendredi.
 * Plafond absolu 20:00 dans tous les cas.
 *
 * Exemples :
 *   siteClosingTime("A", <un lundi>)   -> "20:00"
 *   siteClosingTime("B", <un lundi>)   -> "19:30"
 *   siteClosingTime("B", <un dimanche>)-> "20:00"
 */
export function siteClosingTime(
  siteCode: string | null | undefined,
  isoDate: string,
): string {
  const code = (siteCode ?? "").trim().toUpperCase();
  const jsDow = jsDowOfISO(isoDate); // 0=Dim..6=Sam
  const isWeekend = jsDow === 0 || jsDow === 6;

  let close: string;
  if (code === "A") close = "20:00"; // Magasin A : 20:00 7/7.
  else close = isWeekend ? "20:00" : "19:30"; // autres sites (défaut inclus).

  // Plafond absolu : ne jamais dépasser 20:00.
  return timeToMin(close) > timeToMin(ABSOLUTE_CLOSING) ? ABSOLUTE_CLOSING : close;
}

/** Fermeture en minutes depuis minuit (helper interne pour le moteur). */
export function siteClosingMinutes(
  siteCode: string | null | undefined,
  isoDate: string,
): number {
  return timeToMin(siteClosingTime(siteCode, isoDate));
}
