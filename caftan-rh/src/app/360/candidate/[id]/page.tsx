import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IdCard,
  History,
  FileText,
  Mail,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { buildCandidate360 } from "@/lib/profile360/build";
import { TimelinePanel } from "@/app/rh/candidates/[id]/timeline-panel";
import { CandidateScoreCard } from "@/app/rh/candidates/[id]/score-card";
import { detectGender, genderEmoji, genderLabel } from "@/lib/heuristics/gender";
import { StickyHeader } from "../../sticky-header";
import {
  AnchorMenu,
  AnomaliesSection,
  DocumentsSection,
  IdentityCard,
  MessagesSection,
  SectionAnchor,
  calcAge,
} from "../../sections";

export default async function Candidate360Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const print = sp?.print === "1";

  const data = await buildCandidate360(id);
  if (!data) notFound();
  const { application, candidate, employeeId, documents, messages, anomalies } = data;

  const firstName = candidate.full_name.split(/\s+/)[0] ?? "";
  const detectedGender = detectGender(firstName);
  const age = calcAge(candidate.birth_date);

  const facts = [
    candidate.email ? { label: "Email", value: candidate.email } : null,
    candidate.phone ? { label: "Tél", value: candidate.phone } : null,
    candidate.city ? { label: "Ville", value: candidate.city } : null,
    age != null ? { label: "Âge", value: `${age} ans` } : null,
    candidate.applied_at
      ? { label: "Postulé le", value: formatDate(candidate.applied_at) }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const anchors = [
    { id: "identite", label: "Identité" },
    { id: "scoring", label: "Scoring IA" },
    { id: "timeline", label: "Timeline" },
    { id: "documents", label: "Documents", count: documents.length },
    { id: "emails", label: "Emails", count: messages.length },
    ...(anomalies.length > 0 ? [{ id: "anomalies", label: "Anomalies", count: anomalies.length }] : []),
  ];

  const badges: Array<{ label: string; tone: "muted" | "gold" | "success" | "info" | "warn" | "danger" }> = [];
  badges.push({
    label: STATUS_LABELS[application.status] ?? application.status,
    tone:
      application.status === "hired"
        ? "success"
        : application.status === "refused"
          ? "danger"
          : application.status === "wait_decision"
            ? "muted"
            : "info",
  });
  if (detectedGender !== "unknown") {
    badges.push({ label: `${genderEmoji(detectedGender)} ${genderLabel(detectedGender)}`, tone: "gold" });
  }

  // Layout — print mode hides nav anchors and uses simpler vertical flow
  return (
    <div className={`space-y-4 ${print ? "print-mode" : ""}`}>
      {!print ? (
        <StickyHeader
          name={candidate.full_name}
          subtitle={application.job?.title ?? "Candidature spontanée"}
          facts={facts}
          badges={badges}
          backHref="/rh/candidates"
          backLabel="Liste candidats"
          printHref={`/360/print/candidate/${application.id}`}
          actions={
            <>
              {employeeId ? (
                <Button asChild variant="gold" size="sm">
                  <Link href={`/360/employee/${employeeId}`}>
                    <UserCheck className="h-3.5 w-3.5" /> Voir profil employé
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href={`/rh/candidates/${application.id}`}>Fiche détaillée</Link>
              </Button>
            </>
          }
        />
      ) : (
        <PrintHeader
          name={candidate.full_name}
          subtitle={application.job?.title ?? "Candidature spontanée"}
          facts={facts}
          status={STATUS_LABELS[application.status] ?? application.status}
        />
      )}

      {!print ? <AnchorMenu items={anchors} /> : null}

      {/* Section 1 — Identity */}
      <SectionAnchor id="identite" title="Identité" Icon={IdCard}>
        <IdentityCard
          rows={[
            ["Nom complet", candidate.full_name],
            ["Email", candidate.email],
            ["Téléphone", candidate.phone ?? "—"],
            ["Date de naissance", candidate.birth_date ? formatDate(candidate.birth_date) : "—"],
            ["Âge", age != null ? `${age} ans` : "—"],
            ["NRN", candidate.nrn ?? "—"],
            ["CIN", candidate.cin_number ?? "—"],
            [
              "Adresse",
              candidate.address
                ? `${candidate.address}, ${candidate.postal_code ?? ""} ${candidate.city ?? ""}`
                : "—",
            ],
            ["Pays", candidate.country ?? "—"],
            ["IBAN", candidate.iban ?? "—"],
            ["BIC", candidate.bic ?? "—"],
            ["Transport", candidate.transport_type ?? "—"],
            [
              "Langues",
              candidate.langs && Object.keys(candidate.langs).length > 0
                ? Object.entries(candidate.langs)
                    .map(([k, v]) => `${k} (${v})`)
                    .join(", ")
                : "—",
            ],
            [
              "Contrat souhaité",
              candidate.wanted_contract_type ?? "—",
            ],
            [
              "Disponible à partir",
              candidate.available_from ? formatDate(candidate.available_from) : "—",
            ],
            [
              "Postulé le",
              candidate.applied_at ? formatDate(candidate.applied_at) : "—",
            ],
            [
              "Source",
              candidate.source ?? "—",
            ],
          ]}
        />
      </SectionAnchor>

      {/* Section 2 — Scoring IA candidat */}
      <section id="scoring" className="scroll-mt-20">
        <CandidateScoreCard
          candidate={{
            email: candidate.email,
            phone: candidate.phone,
            birth_date: candidate.birth_date,
            city: candidate.city,
            address: candidate.address,
            postal_code: candidate.postal_code,
            nrn: candidate.nrn,
            iban: candidate.iban,
            motivation: application.motivation,
            available_from: candidate.available_from,
            wanted_contract_type: candidate.wanted_contract_type,
            langs: candidate.langs,
            raw_payload: candidate.raw_payload,
            applied_at: candidate.applied_at,
            created_at: candidate.created_at,
            status: application.status,
          }}
        />
      </section>

      {/* Section 3 — Timeline (re-uses existing) */}
      <section id="timeline" className="scroll-mt-20">
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-bold text-base">Timeline</h2>
              <div className="text-xs text-ink-3">Tous les événements liés à cette candidature.</div>
            </div>
          </div>
        </Card>
        <div className="mt-2">
          <TimelinePanel applicationId={application.id} />
        </div>
      </section>

      {/* Section 4 — Documents */}
      <SectionAnchor
        id="documents"
        title={`Documents (${documents.length})`}
        Icon={FileText}
      >
        <DocumentsSection documents={documents} />
      </SectionAnchor>

      {/* Section 5 — Emails */}
      <SectionAnchor
        id="emails"
        title={`Emails échangés (${messages.length})`}
        Icon={Mail}
        hint="10 derniers messages"
      >
        <MessagesSection messages={messages} />
      </SectionAnchor>

      {/* Section 6 — Anomalies */}
      {anomalies.length > 0 ? (
        <SectionAnchor id="anomalies" title="Anomalies" Icon={AlertTriangle}>
          <AnomaliesSection anomalies={anomalies} />
        </SectionAnchor>
      ) : null}

      {print ? (
        <style>{`@media print { .print\\:hidden{display:none!important} }`}</style>
      ) : null}
    </div>
  );
}

function PrintHeader({
  name,
  subtitle,
  facts,
  status,
}: {
  name: string;
  subtitle?: string | null;
  facts: Array<{ label: string; value: string }>;
  status: string;
}) {
  return (
    <div className="border-b border-line pb-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
        Vue 360° — Candidat
      </div>
      <h1 className="text-2xl font-bold mt-1">{name}</h1>
      {subtitle ? <div className="text-sm text-ink-2">{subtitle}</div> : null}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="font-bold">Statut : {status}</span>
        {facts.map((f, i) => (
          <span key={i}>
            <span className="text-ink-3 font-bold uppercase tracking-wider mr-1">{f.label}</span>
            <span>{f.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
