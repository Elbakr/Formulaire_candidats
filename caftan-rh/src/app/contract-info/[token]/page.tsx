import { createAdminClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/contract-readiness";
import { ContractInfoForm } from "./contract-info-form";

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
            <div className="text-sm font-bold mt-0.5">Complète ton dossier RH</div>
          </div>
          <div className="p-5">{children}</div>
        </div>
        <p className="text-center text-[11px] text-ink-3 mt-3">By AMD Megastore — RH</p>
      </div>
    </main>
  );
}

export default async function ContractInfoTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("id, employee_id, completed_at")
    .eq("token", token)
    .maybeSingle();
  const tok = tokRaw as { id: string; employee_id: string; completed_at: string | null } | null;

  if (!tok) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Lien invalide ou expiré</div>
          <p className="text-sm text-ink-2 mt-1">Contacte l'équipe RH si besoin.</p>
        </div>
      </Shell>
    );
  }

  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, email, contract_type, birth_date, nrn, address, postal_code, city, iban, weekly_hours, start_date, end_date")
    .eq("id", tok.employee_id)
    .maybeSingle();
  const emp = (empRaw ?? {}) as Record<string, unknown>;
  const fullName = (emp.full_name as string) ?? "";
  const firstName = fullName.split(/\s+/)[0] ?? "";

  // Champs manquants demandables au travailleur (on exclut les champs admin/RH).
  const missing = getMissingFields(emp, (emp.contract_type as string) ?? null)
    .filter((f) => !f.adminOnly)
    .map((f) => ({ key: f.key, label: f.label }));

  if (tok.completed_at || missing.length === 0) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Merci {firstName} !</div>
          <p className="text-sm text-ink-2 mt-1">
            Ton dossier est complet. Rien d'autre à faire — l'équipe RH revient vers toi.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-ink-2 leading-relaxed mb-4">
        Bonjour <b className="text-ink">{firstName}</b>, pour finaliser ton dossier et préparer ton contrat,
        merci de compléter les informations ci-dessous. Ça prend une minute 🙏
      </p>
      <ContractInfoForm
        token={token}
        fields={missing}
        firstName={firstName}
        birthDate={(emp.birth_date as string) ?? null}
      />
    </Shell>
  );
}
