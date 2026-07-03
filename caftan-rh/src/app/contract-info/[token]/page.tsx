import { createAdminClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/contract-readiness";
import { getEmployeeIdCard } from "@/lib/id-card";
import { IdCardUpload } from "@/components/id-card-upload";
import { ContractInfoForm } from "./contract-info-form";

export const dynamic = "force-dynamic";

// Karim 2026-07-03 : champs secrétariat social demandés à un CANDIDAT pré-validé
// (lien de pré-embauche). Le candidat remplit tout lui-même, à son rythme.
const CANDIDATE_HIRING_FIELDS: Array<{ key: string; label: string }> = [
  { key: "full_name", label: "Nom complet" },
  { key: "email", label: "Email" },
  { key: "birth_date", label: "Date de naissance" },
  { key: "birth_place", label: "Lieu de naissance" },
  { key: "nrn", label: "Numéro national (NISS)" },
  { key: "nationality", label: "Nationalité" },
  { key: "address", label: "Adresse" },
  { key: "postal_code", label: "Code postal" },
  { key: "city", label: "Commune" },
  { key: "iban", label: "IBAN" },
  { key: "education_level", label: "Niveau scolaire / dernier diplôme" },
  { key: "marital_status", label: "État civil" },
  { key: "dependent_children", label: "Personnes à charge (nombre)" },
  { key: "transport_type", label: "Moyen de transport" },
  { key: "transport_frequency", label: "Abonnement transport" },
  { key: "transport_price", label: "Prix du transport (€)" },
];

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

function InvalidShell() {
  return (
    <Shell>
      <div className="text-center py-4">
        <div className="text-base font-bold text-ink">Lien invalide ou expiré</div>
        <p className="text-sm text-ink-2 mt-1">Contacte l&apos;équipe RH si besoin.</p>
      </div>
    </Shell>
  );
}

export default async function ContractInfoTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("id, employee_id, candidate_id, completed_at")
    .eq("token", token)
    .maybeSingle();
  const tok = tokRaw as { id: string; employee_id: string | null; candidate_id: string | null; completed_at: string | null } | null;
  if (!tok) return <InvalidShell />;

  // ---------------------------------------------------------------------------
  // CANDIDAT PRÉ-VALIDÉ (lien de pré-embauche) — Karim 2026-07-03
  // ---------------------------------------------------------------------------
  if (tok.candidate_id) {
    const { data: candRaw } = await admin
      .from("candidates")
      .select("id, full_name, email, birth_date, birth_place, nrn, nationality, address, postal_code, city, iban, education_level, marital_status, dependent_children, transport_type, transport_frequency, transport_price, is_student")
      .eq("id", tok.candidate_id)
      .maybeSingle();
    if (!candRaw) return <InvalidShell />;
    const cand = candRaw as Record<string, unknown>;
    const firstName = ((cand.full_name as string) ?? "").split(/\s+/)[0] ?? "";

    // Indisponibilités déjà déclarées (étape 2).
    const { data: unavailRaw } = await admin
      .from("candidate_unavailabilities")
      .select("id, day_of_week, date_specific, start_time, end_time, reason, notes")
      .eq("candidate_id", tok.candidate_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const unavailabilities = (unavailRaw ?? []) as Array<{
      id: string; day_of_week: number | null; date_specific: string | null;
      start_time: string | null; end_time: string | null; reason: string | null; notes: string | null;
    }>;

    const missing = CANDIDATE_HIRING_FIELDS.filter((f) => {
      const v = cand[f.key];
      return v === null || v === undefined || String(v).trim() === "";
    });
    const isStudent = typeof cand.is_student === "boolean" ? (cand.is_student as boolean) : null;

    return (
      <Shell>
        <p className="text-sm text-ink-2 leading-relaxed mb-4">
          Bonjour{firstName ? <> <b className="text-ink">{firstName}</b></> : null}, bienvenue chez Caftan Factory 👋
          Merci de renseigner ci-dessous les informations nécessaires à ton embauche. Tu peux le faire à ton rythme —
          chaque champ est enregistré au fur et à mesure.
        </p>
        <ContractInfoForm
          token={token}
          fields={missing}
          firstName={firstName}
          birthDate={(cand.birth_date as string) ?? null}
          isCandidate
          initialIsStudent={isStudent}
          initialUnavailabilities={unavailabilities}
        />
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // EMPLOYÉ (dossier RH classique) — inchangé
  // ---------------------------------------------------------------------------
  if (!tok.employee_id) return <InvalidShell />;
  const employeeId = tok.employee_id;

  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, email, contract_type, birth_date, nrn, address, postal_code, city, iban, weekly_hours, start_date, end_date")
    .eq("id", employeeId)
    .maybeSingle();
  const emp = (empRaw ?? {}) as Record<string, unknown>;
  const fullName = (emp.full_name as string) ?? "";
  const firstName = fullName.split(/\s+/)[0] ?? "";

  const missing = getMissingFields(emp, (emp.contract_type as string) ?? null)
    .filter((f) => !f.adminOnly)
    .map((f) => ({ key: f.key, label: f.label }));

  const idCard = await getEmployeeIdCard(admin, employeeId);
  const idCardExisting = idCard ? { fileName: idCard.file_name, at: idCard.created_at } : null;
  const fieldsDone = missing.length === 0;

  if (fieldsDone && idCard) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Merci {firstName} !</div>
          <p className="text-sm text-ink-2 mt-1">
            Ton dossier est complet (infos + carte d&apos;identité). Rien d&apos;autre à faire —
            l&apos;équipe RH revient vers toi.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-ink-2 leading-relaxed mb-4">
        Bonjour <b className="text-ink">{firstName}</b>, pour finaliser ton dossier et préparer ton contrat,
        merci de compléter les éléments ci-dessous. Ça prend une minute 🙏
      </p>
      {!fieldsDone && (
        <ContractInfoForm
          token={token}
          fields={missing}
          firstName={firstName}
          birthDate={(emp.birth_date as string) ?? null}
        />
      )}
      <div className="mt-4">
        <IdCardUpload kind="token" token={token} existing={idCardExisting} />
      </div>
    </Shell>
  );
}
