// Calculs purs des jours fériés belges légaux.
// Aucune dépendance externe : on utilise uniquement Date + arithmétique entière.
// Les dates sont gérées en UTC pour éviter les sauts DST sur l'arithmétique de jours.

export type LegalHoliday = {
  date: string; // ISO YYYY-MM-DD
  label: string;
  kind: "legal";
};

/**
 * Dimanche de Pâques (calendrier grégorien) — algorithme de Meeus / Jones / Butcher.
 * Retourne une Date en UTC à minuit.
 *
 * Vérifications croisées rapides :
 *  - 2026 : 5 avril
 *  - 2027 : 28 mars
 *  - 2028 : 16 avril
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Renvoie les 10 jours fériés légaux belges pour `year`.
 * Ordre chronologique.
 */
export function belgianHolidaysFor(year: number): LegalHoliday[] {
  const easter = easterSunday(year);
  const easterMonday = addDaysUTC(easter, 1);
  const ascension = addDaysUTC(easter, 39);
  const pentecostMonday = addDaysUTC(easter, 50);

  const fixed = (m: number, d: number) =>
    toISO(new Date(Date.UTC(year, m - 1, d)));

  return [
    { date: fixed(1, 1),    label: "Nouvel An",            kind: "legal" },
    { date: toISO(easterMonday),     label: "Lundi de Pâques",      kind: "legal" },
    { date: fixed(5, 1),    label: "Fête du Travail",      kind: "legal" },
    { date: toISO(ascension),        label: "Ascension",            kind: "legal" },
    { date: toISO(pentecostMonday),  label: "Lundi de Pentecôte",   kind: "legal" },
    { date: fixed(7, 21),   label: "Fête nationale belge", kind: "legal" },
    { date: fixed(8, 15),   label: "Assomption",           kind: "legal" },
    { date: fixed(11, 1),   label: "Toussaint",            kind: "legal" },
    { date: fixed(11, 11),  label: "Armistice 1918",       kind: "legal" },
    { date: fixed(12, 25),  label: "Noël",                 kind: "legal" },
  ];
}

/**
 * Lookup rapide : la date `dateISO` (YYYY-MM-DD) est-elle un jour férié dans `holidaysList` ?
 * Retourne `{legal: true, label}` si oui, `{legal: false}` sinon.
 *
 * `holidaysList` peut venir de la DB (`holidays`) ou de `belgianHolidaysFor()`.
 */
export function isHolidayBE(
  dateISO: string,
  holidaysList: { date: string; label: string }[],
): { legal: boolean; label?: string } {
  const hit = holidaysList.find((h) => h.date === dateISO);
  if (hit) return { legal: true, label: hit.label };
  return { legal: false };
}
