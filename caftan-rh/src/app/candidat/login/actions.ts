"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendCandidateMagicLink } from "@/lib/candidate-auth";

// Deconnexion candidat : retour vers les offres publiques (pas /login staff).
export async function candidatLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/postuler");
}

// Karim 2026-06-13 (Phase 1) : demande d'un lien magique de connexion candidat.
// Cree le compte au passage s'il n'existe pas (= point A du cycle de vie).
export async function requestCandidateLoginAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const email = String(formData.get("email") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim() || undefined;
  const birthDate = String(formData.get("birth_date") ?? "").trim() || undefined;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || undefined;
  const city = String(formData.get("city") ?? "").trim() || undefined;
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = nextRaw.startsWith("/") ? nextRaw : "/candidat";
  return sendCandidateMagicLink(email, { fullName, next, birthDate, postalCode, city });
}
