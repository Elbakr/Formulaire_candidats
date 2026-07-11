// Karim 2026-07-11 : choix du variant (A/B/C/D…) qui colle le mieux à AUJOURD'HUI
// (mode Auto-Variant tablette ET affichage "actif" sur la fiche admin). Pur.
//
// Priorité : (1) le variant qui a un shift AUJOURD'HUI (le plus d'heures, puis
// ordre alphabétique) ; (2) sinon celui dont le PROCHAIN shift est le plus
// proche ; (3) le premier disponible.

type ShiftLite = { date: string; hours?: number | null };
type WeekLite = { shifts?: ShiftLite[] | null };
export type VariantLite = { label: string; weeks?: WeekLite[] | null };

export function pickVariantForToday(variants: VariantLite[], today: string): string {
  const entries = (variants ?? []).filter((v) => v && v.weeks);
  if (entries.length === 0) return "A";

  const hoursOn = (v: VariantLite, date: string): number => {
    let h = 0;
    for (const w of v.weeks ?? []) for (const s of w.shifts ?? []) if (s.date === date) h += s.hours ?? 0;
    return h;
  };
  const soonest = (v: VariantLite): string | null => {
    let best: string | null = null;
    for (const w of v.weeks ?? [])
      for (const s of w.shifts ?? [])
        if (s.date >= today && (best === null || s.date < best)) best = s.date;
    return best;
  };

  const withToday = entries
    .map((v) => ({ v, h: hoursOn(v, today) }))
    .filter((e) => e.h > 0.01);
  if (withToday.length) {
    withToday.sort((a, b) => b.h - a.h || a.v.label.localeCompare(b.v.label));
    return withToday[0].v.label;
  }

  const withSoon = entries
    .map((v) => ({ v, d: soonest(v) }))
    .filter((e): e is { v: VariantLite; d: string } => !!e.d);
  if (withSoon.length) {
    withSoon.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.v.label.localeCompare(b.v.label)));
    return withSoon[0].v.label;
  }

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
