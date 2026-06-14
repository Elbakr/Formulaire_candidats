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

/** Décalage Europe/Brussels en minutes (+60 hiver / +120 été) à un instant UTC donné. */
function brusselsOffsetMinutes(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour; // certains runtimes rendent "24" à minuit
  const asIfUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return (asIfUtc - utcMs) / 60_000;
}

/**
 * Convertit une heure « murale » belge (date + heure locale Europe/Brussels) en
 * instant UTC réel. Indispensable côté serveur Vercel (qui tourne en UTC) :
 * `new Date("2026-06-14T18:00:00")` y est interprété comme 18:00 UTC, soit 20:00
 * belge l'été. Ce helper applique le bon décalage (CET/CEST, DST inclus).
 *
 * @param dateISO "YYYY-MM-DD"
 * @param timeHHMM "HH:MM" ou "HH:MM:SS"
 */
export function brusselsWallTimeToUtc(dateISO: string, timeHHMM: string): Date {
  const [y, mo, d] = dateISO.split("-").map(Number);
  const [hh, mi, se = 0] = timeHHMM.split(":").map(Number);
  // Timestamp « naïf » : on traite la pendule comme si elle était en UTC,
  // puis on retire le décalage réel du fuseau belge à cet instant.
  const naiveUtcMs = Date.UTC(y, mo - 1, d, hh, mi, se);
  const offsetMin = brusselsOffsetMinutes(naiveUtcMs);
  return new Date(naiveUtcMs - offsetMin * 60_000);
}
