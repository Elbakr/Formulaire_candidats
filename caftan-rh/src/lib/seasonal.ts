/**
 * Helpers pour les saisonnalités événementielles (table seasonal_events).
 *
 * Le solver `previewSitePlanAction` consulte ce module pour appliquer un
 * multiplicateur d'effectif (`headcount × multiplier`) quand on tombe dans une
 * fenêtre `kind = 'peak'`. La page /today consomme la même donnée pour afficher
 * un bandeau "pic en cours".
 */
import { createClient } from "@/lib/supabase/server";

export type SeasonalEvent = {
  id: string;
  name: string;
  kind: "peak" | "low" | "closed";
  start_date: string;
  end_date: string;
  staff_multiplier: number | null;
  notes: string | null;
  is_active: boolean | null;
};

/**
 * Charge tous les événements actifs qui chevauchent la fenêtre [startISO, endISO].
 * Sécurisé pour appel depuis un server component / server action (utilise le
 * client SSR — RLS s'applique). Comme la policy SELECT est `using (true)`, tous
 * les events sont visibles.
 */
export async function loadSeasonalEvents(
  startISO: string,
  endISO: string,
): Promise<SeasonalEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seasonal_events")
    .select("id, name, kind, start_date, end_date, staff_multiplier, notes, is_active")
    .eq("is_active", true)
    .lte("start_date", endISO)
    .gte("end_date", startISO)
    .order("start_date", { ascending: true });
  return (data ?? []) as SeasonalEvent[];
}

/**
 * Renvoie le multiplicateur d'effectif effectif pour une date donnée,
 * en composant tous les événements `peak` actifs (les `low` et `closed` ne
 * modifient PAS la phase 1 du solver — ils sont juste informatifs).
 *
 * Si plusieurs `peak` se chevauchent (rare), on prend le MAX.
 *
 * Retourne `{ multiplier: 1, event: null }` si pas de pic en cours.
 */
export function pickPeakMultiplierForDay(
  events: SeasonalEvent[],
  dateISO: string,
): { multiplier: number; event: SeasonalEvent | null } {
  let bestMult = 1;
  let bestEvent: SeasonalEvent | null = null;
  for (const e of events) {
    if (e.kind !== "peak") continue;
    if (dateISO < e.start_date || dateISO > e.end_date) continue;
    const m = e.staff_multiplier ?? 1;
    if (m > bestMult) {
      bestMult = m;
      bestEvent = e;
    }
  }
  return { multiplier: bestMult, event: bestEvent };
}

/**
 * Trouve l'événement saisonnier (peak ou low) actif aujourd'hui,
 * pour la page /today. On préfère le `peak` au `low` pour l'affichage
 * (c'est lui qui demande une action). Si rien aujourd'hui, retourne null.
 */
export function pickActiveSeasonalForToday(
  events: SeasonalEvent[],
  todayISO: string,
): SeasonalEvent | null {
  const inWindow = events.filter(
    (e) => e.is_active !== false && e.start_date <= todayISO && todayISO <= e.end_date,
  );
  // Priorité : peak > closed > low
  const peak = inWindow.find((e) => e.kind === "peak");
  if (peak) return peak;
  const closed = inWindow.find((e) => e.kind === "closed");
  if (closed) return closed;
  const low = inWindow.find((e) => e.kind === "low");
  return low ?? null;
}
