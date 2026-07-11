// Karim 2026-07-11 : choix du variant A/B/C qui colle le mieux à AUJOURD'HUI
// (mode Auto-Variant tablette ET affichage "actif" sur la fiche admin). Pur.
//
// Priorité : (1) le variant qui a un shift AUJOURD'HUI (le plus d'heures, puis
// A>B>C) ; (2) sinon celui dont le PROCHAIN shift est le plus proche ; (3) A.

type ShiftLite = { date: string; hours?: number | null };
type WeekLite = { shifts?: ShiftLite[] | null };
type VariantLite = { weeks?: WeekLite[] | null } | null | undefined;

export type ProposalForPick = {
  variant_a: VariantLite;
  variant_b: VariantLite;
  variant_c: VariantLite;
};

export function pickVariantForToday(prop: ProposalForPick, today: string): "A" | "B" | "C" {
  const entries = (
    [
      { label: "A" as const, v: prop.variant_a },
      { label: "B" as const, v: prop.variant_b },
      { label: "C" as const, v: prop.variant_c },
    ] satisfies Array<{ label: "A" | "B" | "C"; v: VariantLite }>
  ).filter((e): e is { label: "A" | "B" | "C"; v: { weeks?: WeekLite[] | null } } => !!e.v);
  if (entries.length === 0) return "A";

  const hoursOn = (v: { weeks?: WeekLite[] | null }, date: string): number => {
    let h = 0;
    for (const w of v.weeks ?? []) for (const s of w.shifts ?? []) if (s.date === date) h += s.hours ?? 0;
    return h;
  };
  const soonest = (v: { weeks?: WeekLite[] | null }): string | null => {
    let best: string | null = null;
    for (const w of v.weeks ?? [])
      for (const s of w.shifts ?? [])
        if (s.date >= today && (best === null || s.date < best)) best = s.date;
    return best;
  };

  const withToday = entries
    .map((e) => ({ ...e, h: hoursOn(e.v, today) }))
    .filter((e) => e.h > 0.01);
  if (withToday.length) {
    withToday.sort((a, b) => b.h - a.h || a.label.localeCompare(b.label));
    return withToday[0].label;
  }

  const withSoon = entries
    .map((e) => ({ ...e, d: soonest(e.v) }))
    .filter((e): e is { label: "A" | "B" | "C"; v: { weeks?: WeekLite[] | null }; d: string } => !!e.d);
  if (withSoon.length) {
    withSoon.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.label.localeCompare(b.label)));
    return withSoon[0].label;
  }

  return entries[0].label;
}
