// Crescendo des besoins effectifs sur les 7 jours qui precedent les 2
// prochaines fetes marquantes.
// Karim 14/05/2026 : "les 7 derniers jours avant les 2 fetes avec effet
// crescendo de l augmentation du besoin, la premiere fete etant 3 fois plus
// puissante que la 2eme".

export type CrescendoHoliday = {
  date: string;
  priority: number | null;
  kind: string | null;
  shops_closed: boolean | null;
  staff_multiplier: number | string | null;
};

/**
 * Selectionne les fetes "marquantes" pour le crescendo :
 * - shops_closed=true (Aid) ou
 * - staff_multiplier > 1 (rush J-1 Aid, Noel) ou
 * - priority >= 2 (jour ferie majeur)
 */
export function selectMajorHolidays(holidays: CrescendoHoliday[]): CrescendoHoliday[] {
  return holidays.filter((h) => {
    if (h.shops_closed === true) return true;
    const m = h.staff_multiplier == null ? 1.0 : Number(h.staff_multiplier);
    if (Number.isFinite(m) && m > 1.0) return true;
    if ((h.priority ?? 0) >= 2) return true;
    return false;
  });
}

function dayDiff(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00").getTime();
  const b = new Date(toISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Renvoie le multiplicateur crescendo a appliquer sur le besoin pour `dateISO`.
 * - Cherche les 2 prochaines fetes majeures strictement apres dateISO.
 * - Si dateISO est dans la fenetre J-7 a J-1 de la 1ere fete : facteur lineaire
 *   1 a J-7 -> 3 a J-1.
 * - Si dateISO est dans la fenetre J-7 a J-1 de la 2eme fete (et pas dans
 *   celle de la 1ere) : facteur lineaire 1 a J-7 -> 1.5 a J-1.
 * - Sinon : 1.0.
 * Le facteur etant >=1, on retourne 1.0 par defaut.
 */
export function computeCrescendoMultiplier(
  dateISO: string,
  holidays: CrescendoHoliday[],
): { multiplier: number; reason: string | null } {
  const major = selectMajorHolidays(holidays)
    .filter((h) => dayDiff(dateISO, h.date) > 0) // strictement futur
    .sort((a, b) => a.date.localeCompare(b.date));

  if (major.length === 0) return { multiplier: 1.0, reason: null };

  const first = major[0];
  const second = major[1] ?? null;

  const daysToFirst = dayDiff(dateISO, first.date);
  if (daysToFirst >= 1 && daysToFirst <= 7) {
    // Linear: J-7 -> 1.0, J-1 -> 3.0
    const mult = 1.0 + (2.0 * (8 - daysToFirst)) / 7;
    return {
      multiplier: mult,
      reason: `J-${daysToFirst} avant ${first.date} (crescendo x${mult.toFixed(2)})`,
    };
  }

  if (second) {
    const daysToSecond = dayDiff(dateISO, second.date);
    if (daysToSecond >= 1 && daysToSecond <= 7) {
      // Linear: J-7 -> 1.0, J-1 -> 1.5
      const mult = 1.0 + (0.5 * (8 - daysToSecond)) / 7;
      return {
        multiplier: mult,
        reason: `J-${daysToSecond} avant ${second.date} (crescendo x${mult.toFixed(2)})`,
      };
    }
  }

  return { multiplier: 1.0, reason: null };
}

/**
 * Priorite d ordre de traitement des jours par le solver.
 * 100 = critique max, 0 = banal.
 *
 * Karim 14/05 : "priorisant toujours les jours speciaux (feries internationaux
 * et les samedis ensuite les dimanches mais aussi les 7 derniers jours avant
 * les 2 fetes)".
 */
export function dayPriorityScore(
  dateISO: string,
  holidays: CrescendoHoliday[],
): number {
  // Est-ce un jour ferie majeur lui-meme ?
  const hereIsHoliday = selectMajorHolidays(holidays).find((h) => h.date === dateISO);
  if (hereIsHoliday) return 100;

  const dow = new Date(dateISO + "T00:00:00").getDay(); // 0=Dim..6=Sam
  let score = 0;
  if (dow === 6) score = 40; // samedi
  else if (dow === 0) score = 30; // dimanche
  else score = 10; // autre jour

  // Boost si on est dans une fenetre crescendo
  const c = computeCrescendoMultiplier(dateISO, holidays);
  if (c.multiplier > 1.0) {
    // J-1 -> +50 (crescendo 3.0 = boost max); J-7 -> +7
    score += (c.multiplier - 1.0) * 25;
  }
  return score;
}
