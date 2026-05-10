import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IdCard,
  History,
  FileText,
  Mail,
  AlertTriangle,
  CalendarDays,
  Star,
  ClipboardCheck,
  CalendarOff,
  UserPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { buildEmployee360 } from "@/lib/profile360/build";
import { StickyHeader } from "../../sticky-header";
import {
  AnchorMenu,
  AnomaliesSection,
  DocumentsSection,
  IdentityCard,
  MessagesSection,
  OnboardingSection,
  PlanningSection,
  ScoringSection,
  SectionAnchor,
  TimeOffSection,
  calcAge,
} from "../../sections";
import { EmployeeTimelinePanel } from "../../employee-timeline";

export default async function Employee360Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const print = sp?.print === "1";

  const data = await buildEmployee360(id);
  if (!data) notFound();
  const {
    employee,
    applicationId,
    metrics,
    onboarding,
    shifts,
    timeOff,
    evaluations,
    documents,
    messages,
    anomalies,
    activity,
  } = data;

  const age = calcAge(employee.birth_date);

  const facts = [
    employee.email ? { label: "Email", value: employee.email } : null,
    employee.phone ? { label: "Tél", value: employee.phone } : null,
    employee.start_date ? { label: "Entrée", value: formatDate(employee.start_date) } : null,
    employee.contract_type ? { label: "Contrat", value: employee.contract_type } : null,
    employee.weekly_hours != null ? { label: "Heures/sem", value: `${employee.weekly_hours}h` } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const statusBadge =
    employee.status === "active"
      ? { label: "Actif", tone: "success" as const }
      : employee.status === "on_leave"
        ? { label: "En congé", tone: "warn" as const }
        : { label: "Archivé", tone: "muted" as const };

  const badges: Array<{ label: string; tone: "muted" | "gold" | "success" | "info" | "warn" | "danger" }> = [
    statusBadge,
  ];
  if (metrics?.global_score != null) {
    badges.push({
      label: `Score ${Number(metrics.global_score).toFixed(0)}`,
      tone: Number(metrics.global_score) >= 70 ? "gold" : "muted",
    });
  }

  const anchors = [
    { id: "identite", label: "Identité" },
    { id: "scoring", label: "Scoring" },
    { id: "planning", label: "Planning" },
    ...(onboarding ? [{ id: "onboarding", label: "Onboarding" }] : []),
    { id: "timeline", label: "Timeline" },
    { id: "documents", label: "Documents", count: documents.length },
    { id: "emails", label: "Emails", count: messages.length },
    { id: "time-off", label: "Congés", count: timeOff.length },
    ...(anomalies.length > 0 ? [{ id: "anomalies", label: "Anomalies", count: anomalies.length }] : []),
  ];

  return (
    <div className={`space-y-4 ${print ? "print-mode" : ""}`}>
      {!print ? (
        <StickyHeader
          name={employee.full_name}
          subtitle={`${employee.job_title ?? "—"}${employee.department ? ` · ${employee.department.name}` : ""}`}
          facts={facts}
          badges={badges}
          backHref="/planning/employees"
          backLabel="Liste employés"
          printHref={`/360/print/employee/${employee.id}`}
          actions={
            <>
              {applicationId ? (
                <Button asChild variant="gold" size="sm">
                  <Link href={`/360/candidate/${applicationId}`}>
                    <UserPlus className="h-3.5 w-3.5" /> Voir candidature d&apos;origine
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href={`/planning/employees/${employee.id}`}>Fiche détaillée</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/scoring/${employee.id}`}>
                  <Star className="h-3.5 w-3.5" /> Scoring
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <PrintHeader
          name={employee.full_name}
          subtitle={`${employee.job_title ?? ""}${employee.department ? ` · ${employee.department.name}` : ""}`}
          facts={facts}
          status={statusBadge.label}
        />
      )}

      {!print ? <AnchorMenu items={anchors} /> : null}

      {/* Section 1 — Identité */}
      <SectionAnchor id="identite" title="Identité" Icon={IdCard}>
        <IdentityCard
          rows={[
            ["Nom complet", employee.full_name],
            ["Email", employee.email],
            ["Téléphone", employee.phone ?? "—"],
            ["Date de naissance", employee.birth_date ? formatDate(employee.birth_date) : "—"],
            ["Âge", age != null ? `${age} ans` : "—"],
            ["NRN", employee.nrn ?? "—"],
            ["CIN", employee.cin_number ?? "—"],
            [
              "Adresse",
              employee.address
                ? `${employee.address}, ${employee.postal_code ?? ""} ${employee.city ?? ""}`
                : "—",
            ],
            ["Pays", employee.country ?? "—"],
            ["IBAN", employee.iban ?? "—"],
            ["BIC", employee.bic ?? "—"],
            [
              "Langues",
              employee.langs && Object.keys(employee.langs).length > 0
                ? Object.entries(employee.langs)
                    .map(([k, v]) => `${k} (${v})`)
                    .join(", ")
                : "—",
            ],
            ["Contrat", employee.contract_type ?? "—"],
            [
              "Heures/sem",
              employee.weekly_hours != null ? `${employee.weekly_hours}h` : "—",
            ],
            [
              "Date d'entrée",
              employee.start_date ? formatDate(employee.start_date) : "—",
            ],
            [
              "Fin de contrat",
              employee.end_date ? formatDate(employee.end_date) : "—",
            ],
            [
              "Fin d'essai",
              employee.trial_end_date ? formatDate(employee.trial_end_date) : "—",
            ],
            [
              "Service",
              employee.department?.name ?? "—",
            ],
          ]}
        />
      </SectionAnchor>

      {/* Section 2 — Scoring */}
      <SectionAnchor id="scoring" title="Scoring" Icon={Star} hint="KPI + axes managers">
        <ScoringSection metrics={metrics} evaluations={evaluations} employeeId={employee.id} />
      </SectionAnchor>

      {/* Section 3 — Planning (this week + next 4) */}
      <SectionAnchor
        id="planning"
        title="Planning"
        Icon={CalendarDays}
        hint="5 prochaines semaines"
      >
        <PlanningSection
          shifts={shifts}
          weeklyTarget={employee.weekly_hours}
          employeeId={employee.id}
        />
      </SectionAnchor>

      {/* Section 4 — Onboarding */}
      {onboarding ? (
        <SectionAnchor
          id="onboarding"
          title="Onboarding"
          Icon={ClipboardCheck}
          hint={`${onboarding.done}/${onboarding.total} items`}
        >
          <OnboardingSection state={onboarding} employeeId={employee.id} />
        </SectionAnchor>
      ) : null}

      {/* Section 5 — Timeline */}
      <section id="timeline" className="scroll-mt-20">
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-bold text-base">Timeline</h2>
              <div className="text-xs text-ink-3">
                Embauche, évaluations, congés, no-shows, onboarding.
              </div>
            </div>
          </div>
        </Card>
        <div className="mt-2">
          <EmployeeTimelinePanel
            employeeId={employee.id}
            startDate={employee.start_date}
            evaluations={evaluations}
            timeOff={timeOff}
            activity={activity}
          />
        </div>
      </section>

      {/* Section 6 — Time-off */}
      <SectionAnchor
        id="time-off"
        title={`Congés (${timeOff.length})`}
        Icon={CalendarOff}
        hint="20 dernières demandes"
        defaultOpen={false}
      >
        <TimeOffSection items={timeOff} />
      </SectionAnchor>

      {/* Section 7 — Documents */}
      <SectionAnchor
        id="documents"
        title={`Documents (${documents.length})`}
        Icon={FileText}
      >
        <DocumentsSection documents={documents} />
      </SectionAnchor>

      {/* Section 8 — Emails */}
      <SectionAnchor
        id="emails"
        title={`Emails échangés (${messages.length})`}
        Icon={Mail}
        hint="10 derniers messages"
      >
        <MessagesSection messages={messages} />
      </SectionAnchor>

      {/* Section 9 — Anomalies */}
      {anomalies.length > 0 ? (
        <SectionAnchor id="anomalies" title="Anomalies" Icon={AlertTriangle}>
          <AnomaliesSection anomalies={anomalies} />
        </SectionAnchor>
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
        Vue 360° — Employé
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
