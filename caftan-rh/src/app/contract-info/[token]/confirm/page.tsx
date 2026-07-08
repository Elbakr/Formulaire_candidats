// Karim 2026-07-05 : page de CONFIRMATION du dossier candidat. Cible du bouton
// « Je confirme » du mail récapitulatif. Marque `candidates.dossier_confirmed_at`
// (une seule fois), notifie les RH en INTERNE (autorisé), puis affiche un simple
// écran de remerciement. Aucun envoi sortant ici (juste notif interne).

import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-canvas flex items-start sm:items-center justify-center p-4 pt-safe pb-safe"
    >
      <div className="w-full max-w-md">
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-ink text-white px-5 py-4">
            <div className="text-gold font-bold uppercase tracking-[0.12em] text-[11px]">Caftan Factory</div>
            <div className="text-sm font-bold mt-0.5">Confirmation de ton dossier</div>
          </div>
          <div className="p-5">{children}</div>
        </div>
        <p className="text-center text-[11px] text-ink-3 mt-3">By AMD Megastore — RH</p>
      </div>
    </main>
  );
}

export default async function ConfirmDossierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("candidate_id")
    .eq("token", token)
    .maybeSingle();
  const candidateId = (tokRaw as { candidate_id: string | null } | null)?.candidate_id ?? null;

  if (!candidateId) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Lien invalide ou expiré</div>
          <p className="text-sm text-ink-2 mt-1">Contacte l&apos;équipe RH si besoin.</p>
        </div>
      </Shell>
    );
  }

  const { data: candRaw } = await admin
    .from("candidates")
    .select("id, full_name, dossier_confirmed_at")
    .eq("id", candidateId)
    .maybeSingle();
  const cand = candRaw as { id: string; full_name: string | null; dossier_confirmed_at: string | null } | null;
  const firstName = (cand?.full_name ?? "").split(/\s+/)[0] ?? "";
  const name = cand?.full_name ?? "Un candidat";

  // Karim 2026-07-08 : si ce candidat est DÉJÀ embauché ET a signé son contrat,
  // on n'affiche PAS le message pré-embauche (« nous revenons vers toi ») mais un
  // message d'ACCUEIL (il est déjà des nôtres).
  let alreadySigned = false;
  const { data: empRaw } = await admin
    .from("employees")
    .select("id")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  const empId = (empRaw as { id: string } | null)?.id ?? null;
  if (empId) {
    const { data: signedContract } = await admin
      .from("employee_contracts")
      .select("id")
      .eq("employee_id", empId)
      .eq("status", "signed")
      .limit(1)
      .maybeSingle();
    alreadySigned = !!signedContract;
  }

  // Marque la confirmation UNE SEULE fois (idempotent) + notifie les RH.
  const alreadyConfirmed = !!cand?.dossier_confirmed_at;
  if (!alreadyConfirmed) {
    await admin
      .from("candidates")
      .update({ dossier_confirmed_at: new Date().toISOString() })
      .eq("id", candidateId);
    try {
      await notifyRoles(["admin", "rh"], {
        kind: "candidate_dossier_confirmed",
        title: `Dossier CONFIRMÉ : ${name}`,
        body: `${name} a relu et confirmé l'exactitude de son dossier d'embauche (récapitulatif validé).`,
        link: `/rh/candidates/prevalidated/${candidateId}`,
        data: { candidate_id: candidateId },
      });
    } catch {
      /* notif best-effort */
    }
  }

  return (
    <Shell>
      <div className="text-center py-4">
        <div className="inline-flex h-14 w-14 rounded-full items-center justify-center mb-3 bg-success-light text-success">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-ink">
          {alreadySigned ? <>Bienvenue {firstName} ! 🌟</> : <>Merci {firstName} !</>}
        </h2>
        {alreadySigned ? (
          <p className="text-sm text-ink-2 mt-2">
            Ton dossier est <b>à jour</b> et ton <b>contrat est déjà signé</b> — tu fais officiellement
            partie de l&apos;équipe. Merci d&apos;avoir vérifié tes informations. À très vite en magasin !
          </p>
        ) : (
          <p className="text-sm text-ink-2 mt-2">
            Ton dossier est <b>confirmé</b>. Notre équipe RH a bien reçu ta validation et poursuit le traitement.
            Nous revenons vers toi très prochainement.
          </p>
        )}
        {alreadyConfirmed && !alreadySigned ? (
          <p className="text-[12px] text-ink-3 mt-3">Ce dossier était déjà confirmé — rien d&apos;autre à faire.</p>
        ) : null}
      </div>
    </Shell>
  );
}
