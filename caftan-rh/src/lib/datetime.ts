// Karim 2026-06-10 : formatage date/heure TOUJOURS en Europe/Brussels (fr-BE).
//
// Probleme : le serveur Vercel tourne en UTC. Sans `timeZone` explicite,
// `toLocale*` affiche l'heure UTC cote serveur (et le fuseau du telephone cote
// client). Ce helper FORCE le fuseau belge partout (serveur ET client),
// independamment de TZ serveur ou du reglage de l'appareil.
//
// Utiliser ces helpers au lieu de `new Date(x).toLocaleTimeString(...)` direct.

export const APP_TZ = "Europe/Brussels";
export const APP_LOCALE = "fr-BE";

type DateInput = string | number | Date | null | undefined;

function toDate(d: DateInput): Date | null {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Formatage generique force en Europe/Brussels + fr-BE. Retourne "—" si invalide. */
export function fmt(d: DateInput, opts: Intl.DateTimeFormatOptions): string {
  const dt = toDate(d);
  if (!dt) return "—";
  return dt.toLocaleString(APP_LOCALE, { timeZone: APP_TZ, ...opts });
}

/** "14:30" */
export const fmtTime = (d: DateInput) =>
  fmt(d, { hour: "2-digit", minute: "2-digit" });

/** "10 juin" */
export const fmtDate = (d: DateInput) =>
  fmt(d, { day: "2-digit", month: "short" });

/** "10 juin 2026" */
export const fmtDateY = (d: DateInput) =>
  fmt(d, { day: "2-digit", month: "short", year: "numeric" });

/** "10 juin 14:30" */
export const fmtDateTime = (d: DateInput) =>
  fmt(d, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** "mardi 10 juin" */
export const fmtDayDate = (d: DateInput) =>
  fmt(d, { weekday: "long", day: "2-digit", month: "long" });
