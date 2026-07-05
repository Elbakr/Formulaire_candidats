import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/contract-readiness";
import { getEmployeeIdCard, getCandidateIdCard } from "@/lib/id-card";
import { logCandidateAccess } from "@/lib/candidate-access-log";
import { IdCardUpload } from "@/components/id-card-upload";
import type { Locale } from "@/lib/i18n";
import { ContractInfoForm } from "./contract-info-form";

export const dynamic = "force-dynamic";

// Karim 2026-07-05 : auto-détection de la langue du candidat.
// 1) cookie `lang` (choix explicite, prioritaire) ; 2) sinon en-tête
// `accept-language` du navigateur : contient "nl" -> NL, sinon FR (défaut).
async function detectLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get("lang")?.value;
  if (cookieLang === "fr" || cookieLang === "nl") return cookieLang;
  const h = await headers();
  const accept = (h.get("accept-language") ?? "").toLowerCase();
  return accept.includes("nl") ? "nl" : "fr";
}

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

// Karim 2026-07-05 : textes rendus côté SERVEUR de la page candidat, bilingues
// FR/NL. La locale est déjà détectée (cookie `lang` / accept-language) — sans ce
// dictionnaire, l'en-tête + l'intro + les écrans restaient en français quand le
// candidat basculait en NL (le formulaire, lui, était déjà traduit).
const PAGE_T = {
  fr: {
    header_subtitle: "Complète ton dossier RH",
    invalid_title: "Lien invalide ou expiré",
    invalid_body: "Contacte l'équipe RH si besoin.",
    cand_hi: "Bonjour",
    cand_intro:
      ", bienvenue chez Caftan Factory 👋 Merci de renseigner ci-dessous les informations nécessaires à ton embauche. Tu peux le faire à ton rythme — chaque champ est enregistré au fur et à mesure.",
    emp_hi: "Bonjour",
    emp_intro:
      ", pour finaliser ton dossier et préparer ton contrat, merci de compléter les éléments ci-dessous. Ça prend une minute 🙏",
    emp_done_title: "Merci",
    emp_done_body:
      "Ton dossier est complet (infos + carte d'identité). Rien d'autre à faire — l'équipe RH revient vers toi.",
  },
  nl: {
    header_subtitle: "Vul je HR-dossier aan",
    invalid_title: "Ongeldige of vervallen link",
    invalid_body: "Neem contact op met het HR-team indien nodig.",
    cand_hi: "Hallo",
    cand_intro:
      ", welkom bij Caftan Factory 👋 Vul hieronder de gegevens in die nodig zijn voor je aanwerving. Je kunt dit op je eigen tempo doen — elk veld wordt gaandeweg opgeslagen.",
    emp_hi: "Hallo",
    emp_intro:
      ", om je dossier af te ronden en je contract voor te bereiden, vul hieronder de gegevens aan. Het duurt maar een minuutje 🙏",
    emp_done_title: "Bedankt",
    emp_done_body:
      "Je dossier is volledig (gegevens + identiteitskaart). Er is niets anders te doen — het HR-team neemt contact met je op.",
  },
} as const;

function Shell({ children, locale = "fr", hideSubtitle = false }: { children: React.ReactNode; locale?: Locale; hideSubtitle?: boolean }) {
  return (
    <main
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-canvas flex items-start sm:items-center justify-center p-4 pt-safe pb-safe"
    >
      <div className="w-full max-w-md">
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-ink text-white px-5 py-4">
            <div className="text-gold font-bold uppercase tracking-[0.12em] text-[11px]">Caftan Factory</div>
            {/* Karim 2026-07-05 : sous-titre masquable — le formulaire candidat le rend
                lui-même (côté client) pour qu'il bascule avec la langue sans reload. */}
            {hideSubtitle ? null : <div className="text-sm font-bold mt-0.5">{PAGE_T[locale].header_subtitle}</div>}
          </div>
          <div className="p-5">{children}</div>
        </div>
        <p className="text-center text-[11px] text-ink-3 mt-3">By AMD Megastore — RH</p>
      </div>
    </main>
  );
}

function InvalidShell({ locale = "fr" }: { locale?: Locale }) {
  const tt = PAGE_T[locale];
  return (
    <Shell locale={locale}>
      <div className="text-center py-4">
        <div className="text-base font-bold text-ink">{tt.invalid_title}</div>
        <p className="text-sm text-ink-2 mt-1">{tt.invalid_body}</p>
      </div>
    </Shell>
  );
}

export default async function ContractInfoTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await detectLocale();
  const admin = createAdminClient();
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("id, employee_id, candidate_id, completed_at")
    .eq("token", token)
    .maybeSingle();
  const tok = tokRaw as { id: string; employee_id: string | null; candidate_id: string | null; completed_at: string | null } | null;
  if (!tok) return <InvalidShell locale={locale} />;
  const tt = PAGE_T[locale];

  // ---------------------------------------------------------------------------
  // CANDIDAT PRÉ-VALIDÉ (lien de pré-embauche) — Karim 2026-07-03
  // ---------------------------------------------------------------------------
  if (tok.candidate_id) {
    const { data: candRaw } = await admin
      .from("candidates")
      .select("id, full_name, email, birth_date, birth_place, nrn, nationality, address, postal_code, city, iban, education_level, marital_status, dependent_children, transport_type, transport_frequency, transport_price, is_student")
      .eq("id", tok.candidate_id)
      .maybeSingle();
    if (!candRaw) return <InvalidShell locale={locale} />;
    const cand = candRaw as Record<string, unknown>;
    const firstName = ((cand.full_name as string) ?? "").split(/\s+/)[0] ?? "";

    // Anti-fraude : journalise l'accès (IP/appareil/géoloc approx.) — fire-and-forget.
    await logCandidateAccess({ candidateId: tok.candidate_id, context: "contract_info", token });

    // Indisponibilités déjà déclarées (étape 2).
    const { data: unavailRaw } = await admin
      .from("candidate_unavailabilities")
      .select("id, day_of_week, date_specific, date_end, start_time, end_time, reason, notes")
      .eq("candidate_id", tok.candidate_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const unavailabilities = (unavailRaw ?? []) as Array<{
      id: string; day_of_week: number | null; date_specific: string | null; date_end?: string | null;
      start_time: string | null; end_time: string | null; reason: string | null; notes: string | null;
    }>;

    const candIdCard = await getCandidateIdCard(admin, tok.candidate_id);
    const candIdCardExisting = candIdCard ? { fileName: candIdCard.file_name, at: candIdCard.created_at } : null;

    const missing = CANDIDATE_HIRING_FIELDS.filter((f) => {
      const v = cand[f.key];
      return v === null || v === undefined || String(v).trim() === "";
    });
    const isStudent = typeof cand.is_student === "boolean" ? (cand.is_student as boolean) : null;

    return (
      <Shell locale={locale} hideSubtitle>
        <ContractInfoForm
          token={token}
          fields={missing}
          firstName={firstName}
          birthDate={(cand.birth_date as string) ?? null}
          isCandidate
          initialLocale={locale}
          initialIsStudent={isStudent}
          initialUnavailabilities={unavailabilities}
          idCardExisting={candIdCardExisting}
        />
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // EMPLOYÉ (dossier RH classique) — inchangé
  // ---------------------------------------------------------------------------
  if (!tok.employee_id) return <InvalidShell locale={locale} />;
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
      <Shell locale={locale}>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">{tt.emp_done_title} {firstName} !</div>
          <p className="text-sm text-ink-2 mt-1">{tt.emp_done_body}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell locale={locale}>
      <p className="text-sm text-ink-2 leading-relaxed mb-4">
        {tt.emp_hi} <b className="text-ink">{firstName}</b>{tt.emp_intro}
      </p>
      {!fieldsDone && (
        <ContractInfoForm
          token={token}
          fields={missing}
          firstName={firstName}
          birthDate={(emp.birth_date as string) ?? null}
          initialLocale={locale}
        />
      )}
      <div className="mt-4">
        <IdCardUpload kind="token" token={token} existing={idCardExisting} />
      </div>
    </Shell>
  );
}
