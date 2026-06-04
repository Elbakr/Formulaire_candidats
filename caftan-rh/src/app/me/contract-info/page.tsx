// Karim 2026-06-04 : formulaire dynamique pour le worker - ne montre QUE les
// champs manquants requis pour generer son contrat. Lien depuis le mail
// "info-request" envoye par RH.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/contract-readiness";
import { ContractInfoForm } from "./contract-info-form";

export default async function ContractInfoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/me/contract-info");

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!emp) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-lg font-bold">Dossier contrat</h1>
        <p className="text-sm text-ink-3 mt-2">
          Aucune fiche employé associée à ton compte. Contacte le RH si tu attends un contrat.
        </p>
      </div>
    );
  }

  const empRec = emp as Record<string, unknown>;
  const contractType = (emp as { contract_type: string | null }).contract_type;
  const missingAll = getMissingFields(empRec, contractType);
  // adminOnly = decidé par RH (weekly_hours, start_date, end_date) - on ne demande pas au worker
  const missing = missingAll.filter((m) => !m.adminOnly);

  if (missing.length === 0) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <h1 className="text-lg font-bold">✅ Dossier complet</h1>
        <p className="text-sm text-ink-3 mt-2">
          Toutes les infos requises pour ton contrat sont déjà renseignées.
          {missingAll.length > 0 && (
            <span className="block mt-2 text-amber-700">
              Le RH doit encore compléter : {missingAll.map((m) => m.label).join(", ")}.
            </span>
          )}
        </p>
        <a href="/me" className="inline-block mt-3 px-3 py-1.5 bg-gold text-[#1a1a0d] rounded text-sm font-semibold">
          Retour à mon espace
        </a>
      </div>
    );
  }

  // Construit defaults : ce qui est dans la fiche actuelle (pour les champs partiellement remplis)
  const defaults: Record<string, string> = {};
  for (const f of missing) {
    const v = empRec[f.key];
    if (typeof v === "string") defaults[f.key] = v;
    else if (typeof v === "number") defaults[f.key] = String(v);
    else defaults[f.key] = "";
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="mb-4">
        <h1 className="text-lg font-bold">Compléter mon dossier contrat</h1>
        <p className="text-xs text-ink-3 mt-1">
          Il manque <strong>{missing.length} info(s)</strong> pour que ton contrat puisse être généré et envoyé à signer.
          Les champs surlignés en rouge sont obligatoires.
        </p>
        <div className="text-[11px] bg-blue-50 border border-blue-200 rounded p-2 mt-2 text-blue-900">
          🔒 Sécurité : seul toi (compte connecté) peut modifier ces infos. RH est notifié dès que tout est rempli.
        </div>
      </div>
      <ContractInfoForm
        employeeId={(emp as { id: string }).id}
        missing={missing.map((m) => ({ key: m.key, label: m.label }))}
        defaults={defaults}
      />
    </div>
  );
}
