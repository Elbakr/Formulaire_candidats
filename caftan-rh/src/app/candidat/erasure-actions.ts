"use server";

// Karim 2026-06-13 (Phase 4 RGPD) : droit à l'effacement SELF-SERVICE. Le
// candidat/travailleur ne supprime PAS lui-même (sécurité + rétention légale) :
// il crée une DEMANDE que le RH traite (suppression exhaustive côté admin).
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function requestAccountErasure(): Promise<{ ok?: true; error?: string }> {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const name = (prof as { full_name?: string } | null)?.full_name ?? user.email ?? "Utilisateur";
  const email = (prof as { email?: string } | null)?.email ?? user.email ?? "";

  const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
  const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
    recipient_id: p.id,
    kind: "erasure_request",
    title: `Demande d'effacement RGPD — ${name}`,
    body: `${name} (${email}) demande la suppression de son compte et de ses données personnelles. À traiter sous 30 jours (droit à l'effacement RGPD).`,
    link: "/rh/candidates",
    data: { subject_profile_id: user.id, subject_email: email },
  }));
  if (inserts.length > 0) await admin.from("notifications").insert(inserts);
  return { ok: true };
}
