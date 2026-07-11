// Karim 2026-07-11 : choix du variant (A/B/C/D…) qui colle le mieux à l'INSTANT
// PRÉSENT (mode Auto-Variant tablette ET affichage "actif" sur la fiche admin).
//
// CONSCIENT DE L'HEURE (`nowMin`) : un shift AUJOURD'HUI déjà TERMINÉ ne compte
// plus comme « actif » — sinon on afficherait à un travailleur qui arrive à 14h47
// un shift 10:00–14:45 déjà fini (cas réel Salima). Priorité :
//   (1) variant avec un shift aujourd'hui ENCORE en cours / à venir (fin > maintenant),
//       classé par heures restantes puis alpha ;
//   (2) sinon variant dont le PROCHAIN shift (à venir) est le plus proche ;
//   (3) sinon le premier.
// `nowMin = -1` (défaut) désactive la conscience de l'heure (compat/tests).

type ShiftLite = { date: string; start_time?: string | null; end_time?: string | null; hours?: number | null };
type WeekLite = { shifts?: ShiftLite[] | null };
export type VariantLite = { label: string; weeks?: WeekLite[] | null };

function toMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function pickVariantForToday(variants: VariantLite[], today: string, nowMin = -1): string {
  const entries = (variants ?? []).filter((v) => v && v.weeks);
  if (entries.length === 0) return "A";

  // Un shift est ENCORE PERTINENT s'il est à venir (date future) ou aujourd'hui
  // mais pas encore terminé (fin > maintenant).
  const stillRelevant = (s: ShiftLite): boolean =>
    s.date > today || (s.date === today && toMin(s.end_time) > nowMin);

  // Heures d'aujourd'hui ENCORE faisables (shift non terminé).
  const hoursTodayLeft = (v: VariantLite): number => {
    let h = 0;
    for (const w of v.weeks ?? [])
      for (const s of w.shifts ?? [])
        if (s.date === today && toMin(s.end_time) > nowMin) h += s.hours ?? 0;
    return h;
  };
  // Clé du prochain shift PERTINENT (date + heure de début), pour départager.
  const soonest = (v: VariantLite): string | null => {
    let best: string | null = null;
    for (const w of v.weeks ?? [])
      for (const s of w.shifts ?? []) {
        if (!stillRelevant(s)) continue;
        const key = `${s.date} ${(s.start_time ?? "00:00").slice(0, 5)}`;
        if (best === null || key < best) best = key;
      }
    return best;
  };

  // (1) Variant qui fait travailler ENCORE aujourd'hui.
  const withToday = entries
    .map((v) => ({ v, h: hoursTodayLeft(v) }))
    .filter((e) => e.h > 0.01);
  if (withToday.length) {
    withToday.sort((a, b) => b.h - a.h || a.v.label.localeCompare(b.v.label));
    return withToday[0].v.label;
  }

  // (2) Variant dont le prochain shift pertinent est le plus proche.
  const withSoon = entries
    .map((v) => ({ v, d: soonest(v) }))
    .filter((e): e is { v: VariantLite; d: string } => !!e.d);
  if (withSoon.length) {
    withSoon.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.v.label.localeCompare(b.v.label)));
    return withSoon[0].v.label;
  }

  // (3) Fallback : premier variant.
  return entries[0].label;
}

/** Aplati une proposition (A/B/C + extras) en liste de variants pour le picker. */
export function allVariantsOf(prop: {
  variant_a?: VariantLite | null;
  variant_b?: VariantLite | null;
  variant_c?: VariantLite | null;
  variants_extra?: VariantLite[] | null;
}): VariantLite[] {
  const out: VariantLite[] = [];
  if (prop.variant_a) out.push({ ...prop.variant_a, label: prop.variant_a.label || "A" });
  if (prop.variant_b) out.push({ ...prop.variant_b, label: prop.variant_b.label || "B" });
  if (prop.variant_c) out.push({ ...prop.variant_c, label: prop.variant_c.label || "C" });
  for (const e of prop.variants_extra ?? []) if (e) out.push(e);
  return out;
}

/** Minutes écoulées depuis minuit à Bruxelles, pour `nowMin`. */
export function brusselsNowMinutes(): number {
  const hhmm = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return toMin(hhmm);
}
