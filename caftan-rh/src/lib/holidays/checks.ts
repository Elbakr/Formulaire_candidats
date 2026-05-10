// Lectures DB pour les jours fériés et fermetures spécifiques.
// Utilisable dans les Server Components (Next 16) ou les server actions.
// Pas de dépendance à `auto-planning.ts` — c'est volontaire (autre wave).

import { createClient } from "@/lib/supabase/server";

export type HolidayRow = {
  id: string;
  date: string;
  label: string;
  kind: "legal" | "school_break" | "company_closure" | "event_other";
  region: string | null;
  is_active: boolean | null;
};

export type ClosureRow = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  department_id: string | null;
  reason: string | null;
};

/**
 * Récupère tous les `holidays` actifs dont la date est dans [startISO, endISO].
 * (Plage inclusive, format YYYY-MM-DD.)
 */
export async function getHolidaysForRange(
  startISO: string,
  endISO: string,
): Promise<HolidayRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("holidays")
    .select("id, date, label, kind, region, is_active")
    .gte("date", startISO)
    .lte("date", endISO)
    .eq("is_active", true)
    .order("date");
  return (data ?? []) as HolidayRow[];
}

/**
 * Récupère toutes les fermetures (`company_closures`) qui chevauchent [startISO, endISO].
 * Si `departmentId` est fourni, on filtre :
 *   - soit closure rattaché au département,
 *   - soit closure global (department_id IS NULL = fermeture toute l'organisation).
 * Sans `departmentId`, on retourne tout.
 */
export async function getClosuresForRange(
  startISO: string,
  endISO: string,
  departmentId?: string | null,
): Promise<ClosureRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("company_closures")
    .select("id, label, start_date, end_date, department_id, reason")
    .lte("start_date", endISO)
    .gte("end_date", startISO);

  if (departmentId) {
    query = query.or(`department_id.eq.${departmentId},department_id.is.null`);
  }
  const { data } = await query.order("start_date");
  return (data ?? []) as ClosureRow[];
}

/**
 * Helper synchrone : étant donné la liste des fermetures déjà fetchée,
 * retourne celles qui couvrent `dateISO` (et matchent le département si fourni).
 */
export function closuresForDate(
  closures: ClosureRow[],
  dateISO: string,
  departmentId?: string | null,
): ClosureRow[] {
  return closures.filter((c) => {
    if (dateISO < c.start_date || dateISO > c.end_date) return false;
    if (!departmentId) return true;
    // Fermeture globale (department_id null) ou ciblée sur le département de l'employé
    return c.department_id === null || c.department_id === departmentId;
  });
}
