/**
 * employee-availability.ts
 * Fonctions server-only pour les disponibilités déclarées des employés.
 * Utilisé pour le matching renfort : qui est disponible sur un créneau donné ?
 *
 * Conventions :
 * - createAdminClient() pour les requêtes cross-employés (lecture RLS bypass)
 * - createClient()      pour les lectures liées au profil connecté
 */

import { createAdminClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────

export type AvailableEmployee = {
  employee_id: string;
  full_name: string;
};

export type EmployeeAvailabilityRow = {
  id: string;
  employee_id: string;
  day_of_week: number | null;
  specific_date: string | null;  // "YYYY-MM-DD"
  start_time: string;            // "HH:MM:SS"
  end_time: string;              // "HH:MM:SS"
  available_for_reinforcement: boolean;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────

/**
 * Retourne le day_of_week (0=Dimanche…6=Samedi, convention JS / Supabase)
 * depuis une date "YYYY-MM-DD".
 * On utilise T12:00:00Z pour éviter les décalages de fuseau (UTC stable).
 */
function dayOfWeekFromDate(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

/** Compare deux heures "HH:MM" ou "HH:MM:SS" — renvoie vrai si a <= b. */
function timeLE(a: string, b: string): boolean {
  return a.slice(0, 5) <= b.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────
// Requête principale : employés disponibles pour un créneau
// ─────────────────────────────────────────────────────────────

/**
 * Retourne les employés actifs qui :
 *  1. ont une dispo (récurrente ou one-off) couvrant [startTime, endTime] ce jour
 *  2. available_for_reinforcement = true
 *  3. n'ont PAS un shift ce jour qui chevauche [startTime, endTime] (status != 'cancelled')
 *  4. ne sont PAS en congé approuvé ce jour
 *  5. (best-effort) sont affectés au site demandé (si siteId fourni)
 *
 * @param siteId    UUID du site concerné (null = pas de filtre site)
 * @param date      "YYYY-MM-DD"
 * @param startTime "HH:MM"
 * @param endTime   "HH:MM"
 */
export async function getAvailableEmployeesForSlot(args: {
  siteId: string | null;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<AvailableEmployee[]> {
  const { siteId, date, startTime, endTime } = args;
  const admin = createAdminClient();
  const dow = dayOfWeekFromDate(date);

  // ── 1. Récupérer toutes les disponibilités actives pour ce jour ──────────
  // (récurrentes correspondant au day_of_week OU one-off = date)
  const { data: avails, error: availErr } = await admin
    .from("employee_availability")
    .select("employee_id, start_time, end_time")
    .eq("is_active", true)
    .eq("available_for_reinforcement", true)
    .or(`day_of_week.eq.${dow},specific_date.eq.${date}`);

  if (availErr || !avails || avails.length === 0) return [];

  // Garder seulement celles qui COUVRENT le créneau demandé
  const covering = (
    avails as Array<{ employee_id: string; start_time: string; end_time: string }>
  ).filter(
    (a) => timeLE(a.start_time, startTime) && timeLE(endTime, a.end_time)
  );
  if (covering.length === 0) return [];

  const candidateIds = [...new Set(covering.map((a) => a.employee_id))];

  // ── 2. Filtre site (best-effort via site_assignments) ────────────────────
  // Si la table site_assignments n'existe pas, l'erreur est ignorée et
  // tous les candidats sont conservés.
  let siteFilteredIds = candidateIds;
  if (siteId) {
    const { data: assignments } = await admin
      .from("site_assignments")
      .select("employee_id")
      .eq("site_id", siteId)
      .in("employee_id", candidateIds);
    // Si la table n'existe pas (error != null), assignments sera null → on garde tous
    if (assignments && assignments.length > 0) {
      const assigned = new Set(
        (assignments as Array<{ employee_id: string }>).map((a) => a.employee_id)
      );
      siteFilteredIds = candidateIds.filter((id) => assigned.has(id));
    }
    // Si la table n'a aucun résultat pour ce site, on ne filtre pas
    // (les données d'affectation sont peut-être incomplètes)
  }

  if (siteFilteredIds.length === 0) return [];

  // ── 3. Exclure les employés ayant un shift qui chevauche ce créneau ──────
  // Chevauchement : shift.start_time < endTime AND shift.end_time > startTime
  const { data: conflictShifts } = await admin
    .from("shifts")
    .select("employee_id")
    .eq("date", date)
    .neq("status", "cancelled")
    .in("employee_id", siteFilteredIds)
    .lt("start_time", endTime)
    .gt("end_time", startTime);

  const busySet = new Set(
    (conflictShifts as Array<{ employee_id: string }> | null ?? []).map(
      (s) => s.employee_id
    )
  );

  // ── 4. Exclure les employés en congé approuvé ce jour ───────────────────
  const { data: leaves } = await admin
    .from("time_off_requests")
    .select("employee_id")
    .eq("status", "approved")
    .lte("start_date", date)
    .gte("end_date", date)
    .in("employee_id", siteFilteredIds);

  const onLeaveSet = new Set(
    (leaves as Array<{ employee_id: string }> | null ?? []).map(
      (l) => l.employee_id
    )
  );

  const availableIds = siteFilteredIds.filter(
    (id) => !busySet.has(id) && !onLeaveSet.has(id)
  );
  if (availableIds.length === 0) return [];

  // ── 5. Récupérer les noms (employés actifs uniquement) ───────────────────
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name")
    .in("id", availableIds)
    .eq("status", "active");

  return (employees as Array<{ id: string; full_name: string }> | null ?? []).map(
    (e) => ({ employee_id: e.id, full_name: e.full_name })
  );
}

// ─────────────────────────────────────────────────────────────
// Lecture des disponibilités d'un employé donné
// ─────────────────────────────────────────────────────────────

/**
 * Retourne toutes les disponibilités actives d'un employé (pour affichage page /me/availability).
 * Utilise createAdminClient pour bypasser RLS (appelé depuis un Server Component
 * après que le profil ait déjà été vérifié par requireProfile).
 */
export async function getMyAvailability(
  employeeId: string
): Promise<EmployeeAvailabilityRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_availability")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true, nullsFirst: false })
    .order("specific_date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[employee-availability] getMyAvailability:", error.message);
    return [];
  }
  return (data ?? []) as EmployeeAvailabilityRow[];
}

// ─────────────────────────────────────────────────────────────
// Helpers d'affichage
// ─────────────────────────────────────────────────────────────

const DAY_LABELS_FR: Record<number, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

const DAY_LABELS_NL: Record<number, string> = {
  0: "Zondag",
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
};

export function dayLabel(dow: number, locale: "fr" | "nl"): string {
  return locale === "nl" ? DAY_LABELS_NL[dow] : DAY_LABELS_FR[dow];
}

/** Formate "HH:MM:SS" → "HH:MM" */
export function fmtTime(t: string): string {
  return t.slice(0, 5);
}
