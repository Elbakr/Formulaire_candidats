// Executive-summary print view. Renders a compact, mostly-text version of
// the 360° profile suited to A4 printing.
//
// URL: /360/print/candidate/[applicationId]
//      /360/print/employee/[employeeId]
//
// Triggers `window.print()` automatically after first paint via a tiny
// inline client component.

import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildCandidate360, buildEmployee360 } from "@/lib/profile360/build";
import { calcAge } from "../../../sections";
import { AutoPrint } from "./auto-print";

const SCORE_AXES: Array<[string, string]> = [
  ["ponctualite", "Ponctualité"],
  ["presentation", "Présentation"],
  ["communication", "Communication"],
  ["motivation", "Motivation"],
  ["experience", "Expérience"],
  ["polyvalence", "Polyvalence"],
  ["disponibilite", "Disponibilité"],
];

export default async function Profile360PrintPage(props: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await props.params;
  if (type === "candidate") return <CandidatePrint applicationId={id} />;
  if (type === "employee") return <EmployeePrint employeeId={id} />;
  notFound();
}

async function CandidatePrint({ applicationId }: { applicationId: string }) {
  const data = await buildCandidate360(applicationId);
  if (!data) notFound();
  const { application, candidate, documents, messages } = data;
  const age = calcAge(candidate.birth_date);

  return (
    <article className="space-y-4 text-sm">
      <AutoPrint />
      <header className="border-b-2 border-ink pb-3">
        <div className="flex items-center gap-2 print:hidden">
          <Printer className="h-3.5 w-3.5" />
          <span className="text-xs text-ink-3">
            Si l&apos;impression ne se déclenche pas, utilise Ctrl/Cmd + P.
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mt-1">
          Vue 360° — Synthèse candidat
        </div>
        <h1 className="text-2xl font-bold mt-1">{candidate.full_name}</h1>
        <div className="text-sm text-ink-2">
          {application.job?.title ?? "Candidature spontanée"}
        </div>
      </header>

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Statut & coordonnées
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Item label="Statut">
            <Badge variant={application.status as never}>
              {STATUS_LABELS[application.status] ?? application.status}
            </Badge>
          </Item>
          <Item label="Postulé le">
            {candidate.applied_at ? formatDate(candidate.applied_at) : "—"}
          </Item>
          <Item label="Email">{candidate.email}</Item>
          <Item label="Téléphone">{candidate.phone ?? "—"}</Item>
          <Item label="Âge">{age != null ? `${age} ans` : "—"}</Item>
          <Item label="Ville">{candidate.city ?? "—"}</Item>
          <Item label="NRN">{candidate.nrn ?? "—"}</Item>
          <Item label="IBAN">{candidate.iban ?? "—"}</Item>
        </div>
      </section>

      {application.motivation ? (
        <section>
          <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
            Motivation
          </h2>
          <p className="whitespace-pre-wrap leading-relaxed">{application.motivation}</p>
        </section>
      ) : null}

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Documents ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="text-ink-3">Aucun document.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {documents.slice(0, 12).map((d) => (
              <li key={d.id}>
                · {d.file_name}{" "}
                <span className="text-ink-3">
                  ({d.kind ?? d.catalog_slug ?? "doc"} — {formatDate(d.created_at)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Derniers échanges email ({messages.length})
        </h2>
        {messages.length === 0 ? (
          <p className="text-ink-3">Aucun email.</p>
        ) : (
          <ul className="text-xs space-y-1.5">
            {messages.slice(0, 6).map((m) => (
              <li key={m.id}>
                <span className="font-bold">
                  {m.direction === "outbound" ? "→" : "←"}{" "}
                  {m.subject?.trim() || (m.direction === "outbound" ? "Email envoyé" : "Email reçu")}
                </span>{" "}
                <span className="text-ink-3">— {formatDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

async function EmployeePrint({ employeeId }: { employeeId: string }) {
  const data = await buildEmployee360(employeeId);
  if (!data) notFound();
  const { employee, metrics, evaluations, shifts, timeOff, onboarding } = data;
  const age = calcAge(employee.birth_date);

  // Axis averages
  const axisAverages: Record<string, number> = {};
  if (evaluations.length > 0) {
    for (const [k] of SCORE_AXES) {
      const vals = evaluations
        .map((e) => Number((e.scores ?? {})[k] ?? 0))
        .filter((v) => v > 0);
      axisAverages[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }

  return (
    <article className="space-y-4 text-sm">
      <AutoPrint />
      <header className="border-b-2 border-ink pb-3">
        <div className="flex items-center gap-2 print:hidden">
          <Printer className="h-3.5 w-3.5" />
          <span className="text-xs text-ink-3">
            Si l&apos;impression ne se déclenche pas, utilise Ctrl/Cmd + P.
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mt-1">
          Vue 360° — Synthèse employé
        </div>
        <h1 className="text-2xl font-bold mt-1">{employee.full_name}</h1>
        <div className="text-sm text-ink-2">
          {employee.job_title ?? "—"}
          {employee.department ? ` · ${employee.department.name}` : ""}
        </div>
      </header>

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Identité
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Item label="Statut">{employee.status}</Item>
          <Item label="Date d&apos;entrée">
            {employee.start_date ? formatDate(employee.start_date) : "—"}
          </Item>
          <Item label="Contrat">{employee.contract_type ?? "—"}</Item>
          <Item label="Heures/sem">
            {employee.weekly_hours != null ? `${employee.weekly_hours}h` : "—"}
          </Item>
          <Item label="Email">{employee.email}</Item>
          <Item label="Téléphone">{employee.phone ?? "—"}</Item>
          <Item label="Âge">{age != null ? `${age} ans` : "—"}</Item>
          <Item label="Ville">{employee.city ?? "—"}</Item>
          <Item label="IBAN">{employee.iban ?? "—"}</Item>
          <Item label="NRN">{employee.nrn ?? "—"}</Item>
        </div>
      </section>

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Scoring
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Item label="Score global">
            {metrics?.global_score != null ? Number(metrics.global_score).toFixed(0) : "—"}
          </Item>
          <Item label="Fiabilité">
            {metrics?.reliability_pct != null ? `${Number(metrics.reliability_pct).toFixed(0)}%` : "—"}
          </Item>
          <Item label="Couverture">
            {metrics?.coverage_pct != null ? `${Number(metrics.coverage_pct).toFixed(0)}%` : "—"}
          </Item>
          <Item label="Shifts (12m)">
            {`${metrics?.shifts_done ?? 0}/${metrics?.shifts_total ?? 0}`}
          </Item>
        </div>
        {evaluations.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {SCORE_AXES.map(([k, lbl]) => {
              const v = axisAverages[k] ?? 0;
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="font-bold w-[120px]">{lbl}</span>
                  <span className="font-mono">{v ? v.toFixed(1) : "—"} / 5</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {onboarding ? (
        <section>
          <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
            Onboarding
          </h2>
          <p>
            {onboarding.done}/{onboarding.total} items —{" "}
            <span className="font-bold">{onboarding.pct}%</span>{" "}
            {onboarding.completed_at ? `(terminé le ${formatDate(onboarding.completed_at)})` : "(en cours)"}
          </p>
          {onboarding.pendingItems.length > 0 ? (
            <ul className="text-xs mt-1.5 space-y-0.5">
              {onboarding.pendingItems.map((it) => (
                <li key={it.id}>· {it.label}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Planning (5 prochaines semaines)
        </h2>
        {shifts.length === 0 ? (
          <p className="text-ink-3">Aucun shift planifié sur la période.</p>
        ) : (
          <p>
            <span className="font-bold">{shifts.length}</span> shift(s) planifié(s).
          </p>
        )}
      </section>

      <section>
        <h2 className="font-bold uppercase text-xs tracking-wider text-ink-3 mb-2">
          Congés ({timeOff.length})
        </h2>
        {timeOff.length === 0 ? (
          <p className="text-ink-3">Aucune demande.</p>
        ) : (
          <ul className="text-xs space-y-0.5">
            {timeOff.slice(0, 6).map((t) => (
              <li key={t.id}>
                · {formatDate(t.start_date)} → {formatDate(t.end_date)} —{" "}
                <span className="text-ink-3">
                  {t.kind ?? "Congé"} · {t.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider font-bold text-ink-3">{label}</div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}
