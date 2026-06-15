"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { acceptUrgentOffer } from "@/lib/scheduling/urgent-cascade";

// Acceptation 1-clic d'une offre de renfort URGENT (cascade).
// L'employe arrive ici depuis la notification 'urgent_replacement_offer'
// (lien /me/urgent-reinforcement/[id]). On verifie cote serveur que c'est bien
// lui le candidat actuellement propose avant de deleguer a acceptUrgentOffer().
export async function acceptUrgentReinforcementAction(
  reinforcementId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { user } = await requireProfile();
  const supabase = await createClient();

  // Resout l'employe lie au compte connecte.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const myEmpId = (emp as { id: string } | null)?.id ?? null;
  if (!myEmpId) return { error: "Aucun profil employe lie a ce compte." };

  // Verifie que la proposition courante lui est bien adressee.
  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select("id, status, proposed_employee_id, is_urgent")
    .eq("id", reinforcementId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as {
    status: string;
    proposed_employee_id: string | null;
    is_urgent: boolean | null;
  };
  if (!r.is_urgent) return { error: "Cette demande n'est pas une cascade urgente." };
  if (r.status !== "sent_to_employee" || r.proposed_employee_id !== myEmpId) {
    return { error: "Cette proposition ne t'est plus adressee." };
  }

  const result = await acceptUrgentOffer(reinforcementId, myEmpId);
  if (result.error) return { error: result.error };

  revalidatePath(`/me/urgent-reinforcement/${reinforcementId}`);
  revalidatePath("/me");
  revalidatePath("/planning/reinforcement");
  return { ok: true };
}

// Refus explicite : marque la proposition courante 'declined' pour que la
// prochaine passe du cron enchaine immediatement sur le candidat suivant.
export async function declineUrgentReinforcementAction(
  reinforcementId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const myEmpId = (emp as { id: string } | null)?.id ?? null;
  if (!myEmpId) return { error: "Aucun profil employe lie a ce compte." };

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select("id, status, proposed_employee_id, current_proposal_id, is_urgent")
    .eq("id", reinforcementId)
    .maybeSingle();
  if (!req) return { error: "Demande introuvable." };
  const r = req as {
    status: string;
    proposed_employee_id: string | null;
    current_proposal_id: string | null;
    is_urgent: boolean | null;
  };
  if (!r.is_urgent) return { error: "Cette demande n'est pas une cascade urgente." };
  if (r.status !== "sent_to_employee" || r.proposed_employee_id !== myEmpId) {
    return { error: "Cette proposition ne t'est plus adressee." };
  }

  const nowISO = new Date().toISOString();
  if (r.current_proposal_id) {
    await admin
      .from("reinforcement_proposal_log")
      .update({ status: "declined", responded_at: nowISO, response: "declined" })
      .eq("id", r.current_proposal_id)
      .eq("status", "sent");
  }
  // Repasse la demande en 'open' + cascade active : le prochain tick du cron
  // proposera immediatement au candidat suivant (proposition expiree/declinee).
  await admin
    .from("reinforcement_requests")
    .update({ status: "open", proposed_employee_id: null, current_proposal_id: null })
    .eq("id", reinforcementId)
    .eq("status", "sent_to_employee");

  revalidatePath(`/me/urgent-reinforcement/${reinforcementId}`);
  revalidatePath("/me");
  return { ok: true };
}
