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
 * Karim 15/05 v3 : detection "pont".
 * Cas couverts :
 *  - Vendredi APRES jeudi ferie -> rush du pont weekend prolonge
 *  - Lundi AVANT mardi ferie -> idem (pont du mardi)
 *  - Samedi AVANT lundi ferie -> weekend etendu (Pentecote, Ascension qui
 *    tombe sur un lundi, etc.)
 *  - Dimanche AVANT lundi ferie -> idem, encore plus marque (veille du pont)
 *  - Mardi APRES lundi ferie -> creux car les gens font le pont (lundi-mardi)
 *
 * Karim 15/05 v4 : extension Pentecote. Quand le lundi est ferie, le
 * weekend SAMEDI-DIMANCHE-LUNDI est exceptionnellement charge (3 jours
 * de pont), encore plus si un autre ferie majeur (Aid) approche
 * -- traite via crescendo separement.
 *
 * Formule : pontMult = 1 + (holidayStaffMult - 1) * 0.75
 *  - holiday a staff_mult=1.5 -> pont = 1.375
 *  - holiday a staff_mult=2.0 -> pont = 1.75
 *  - holiday sans staff_mult -> pont = 1.75 (base 2.0 par defaut)
 */
export function computePontMultiplier(
  dateISO: string,
  holidays: CrescendoHoliday[],
): { multiplier: number; reason: string | null } {
  const date = new Date(dateISO + "T00:00:00");
  const dow = date.getDay(); // 0=Dim..6=Sam

  function adjHoliday(deltaDays: number): CrescendoHoliday | null {
    const target = new Date(date);
    target.setDate(target.getDate() + deltaDays);
    const targetISO = target.toISOString().slice(0, 10);
    return (
      holidays.find(
        (h) =>
          h.date === targetISO &&
          (h.kind === "international" ||
            (h.priority ?? 0) >= 2 ||
            (h.staff_multiplier != null && Number(h.staff_multiplier) > 1.0)),
      ) ?? null
    );
  }

  let related: CrescendoHoliday | null = null;
  let label: string | null = null;

  if (dow === 5) {
    // Vendredi -> jeudi ferie ?
    related = adjHoliday(-1);
    if (related) label = `Pont vendredi après férié jeudi ${related.date}`;
  } else if (dow === 1) {
    // Lundi -> mardi ferie ?
    related = adjHoliday(1);
    if (related) label = `Pont lundi avant férié mardi ${related.date}`;
  } else if (dow === 6) {
    // Samedi -> lundi ferie a J+2 ? Weekend etendu samedi-dimanche-lundi
    related = adjHoliday(2);
    if (related) label = `Samedi avant lundi férié ${related.date} (weekend étendu)`;
  } else if (dow === 0) {
    // Dimanche -> lundi ferie a J+1 ? Veille du pont, encore plus marquee
    related = adjHoliday(1);
    if (related) label = `Dimanche avant lundi férié ${related.date} (veille pont)`;
  } else if (dow === 2) {
    // Mardi -> lundi ferie a J-1 ? Reprise apres pont, rush retombe mais
    // souvent les gens reprennent plus tard -> on l accentue legerement.
    related = adjHoliday(-1);
    if (related) label = `Mardi après lundi férié ${related.date} (post-pont)`;
  }

  if (!related) return { multiplier: 1.0, reason: null };

  const holidayMult =
    related.staff_multiplier != null && Number(related.staff_multiplier) > 1.0
      ? Number(related.staff_multiplier)
      : 2.0; // ferie sans staff_mult explicite -> base 2.0 pour calcul pont
  const pontMult = 1.0 + (holidayMult - 1.0) * 0.75;
  return { multiplier: pontMult, reason: label };
}

/**
 * Priorite d ordre de traitement des jours par le solver.
 * 100 = critique max, 0 = banal.
 *
 * Karim 14/05 : "priorisant toujours les jours speciaux (feries internationaux
 * et les samedis ensuite les dimanches mais aussi les 7 derniers jours avant
 * les 2 fetes)".
 * Karim 15/05 v3 : jours pont (vendredi apres jeudi ferie, lundi avant
 * mardi ferie) traites avec score eleve, juste sous les feries.
 */
export function dayPriorityScore(
  dateISO: string,
  holidays: CrescendoHoliday[],
): number {
  // Est-ce un jour ferie majeur lui-meme ?
  const hereIsHoliday = selectMajorHolidays(holidays).find((h) => h.date === dateISO);
  if (hereIsHoliday) return 100;

  // Pont vendredi/lundi -> haut prioritaire
  const pont = computePontMultiplier(dateISO, holidays);
  if (pont.multiplier > 1.0) return 80;

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
