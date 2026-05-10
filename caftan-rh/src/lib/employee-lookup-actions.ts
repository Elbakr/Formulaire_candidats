"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

/**
 * Retourne le `profile_id` lié à un `employees.id`.
 * N'expose qu'un id (pas de PII) — accessible à tout utilisateur authentifié.
 * Utilisé par <EmployeeQuickLink> pour ouvrir un DM sans round-trip côté API.
 */
export async function lookupProfileIdByEmployeeAction(
  employeeId: string,
): Promise<{ profileId: string | null; error?: string }> {
  if (!employeeId) return { profileId: null, error: "employeeId requis." };
  // S'assure qu'on est authentifié — empêche la fuite par scrape anonyme.
  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("profile_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) return { profileId: null, error: error.message };
  return { profileId: (data?.profile_id as string | null) ?? null };
}

/**
 * Retourne l'`employees.id` lié à un `profiles.id`. Utile dans le chat où
 * on connaît l'auteur via son profile_id mais pas son employee_id.
 * N'expose qu'un id (pas de PII).
 */
export async function lookupEmployeeIdByProfileAction(
  profileId: string,
): Promise<{ employeeId: string | null; error?: string }> {
  if (!profileId) return { employeeId: null, error: "profileId requis." };
  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) return { employeeId: null, error: error.message };
  return { employeeId: (data?.id as string | null) ?? null };
}

