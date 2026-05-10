// Shared visual primitives for the 360° profile page.
// Server components — no client interaction beyond `<details>` for collapsing.

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Info,
  Mail,
  MailOpen,
  Star,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  type AnomalyRow,
  type DocRow,
  type EvaluationRow,
  type MessageRow,
  type OnboardingState,
  type ShiftRow,
  type TimeOffRow,
} from "@/lib/profile360/build";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

export function Info360({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5 break-words">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{children}</div>
    </div>
  );
}

export function SectionAnchor({
  id,
  title,
  Icon,
  hint,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  Icon: typeof Info;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <details open={defaultOpen} className="group">
          <summary className="cursor-pointer p-4 border-b border-line flex items-center gap-3 list-none">
            <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base">{title}</h2>
              {hint ? <div className="text-xs text-ink-3">{hint}</div> : null}
            </div>
            <span className="text-xs text-ink-3 font-bold uppercase tracking-wider">
              <span className="group-open:hidden">Afficher</span>
              <span className="hidden group-open:inline">Masquer</span>
            </span>
          </summary>
          <div>{children}</div>
        </details>
      </Card>
    </section>
  );
}

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

// ──────────────────────────────────────────────────────────────────
// Identity card (works for both candidate and employee)
// ──────────────────────────────────────────────────────────────────

export function IdentityCard({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map(([label, value], idx) => (
        <Info360 key={`${label}-${idx}`} label={label}>
          {value}
        </Info360>
      ))}
    </div>
  );
}

export { calcAge };

// ──────────────────────────────────────────────────────────────────
// Documents grid
// ──────────────────────────────────────────────────────────────────

export function DocumentsSection({ documents }: { documents: DocRow[] }) {
  if (documents.length === 0) {
    return (
      <div className="p-6 text-sm text-ink-3">Aucun document.</div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {documents.map((d) => {
        const status = (d.validation_status ?? "").toLowerCase();
        const statusLabel =
          status === "approved" || status === "valid"
            ? { label: "Validé", cls: "bg-success-light text-success" }
            : status === "rejected"
              ? { label: "Refusé", cls: "bg-danger-light text-danger" }
              : status === "pending"
                ? { label: "En attente", cls: "bg-warn-light text-warn" }
                : null;
        return (
          <li key={d.id} className="p-3 flex items-center gap-3 text-sm">
            <div className="h-8 w-8 rounded-md bg-surface-2 text-ink-2 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{d.file_name}</div>
              <div className="text-[11px] text-ink-3 flex items-center gap-2 flex-wrap mt-0.5">
                <span className="uppercase">{d.kind ?? d.catalog_slug ?? "doc"}</span>
                {d.size_bytes ? (
                  <span>· {(d.size_bytes / 1024).toFixed(0)} Ko</span>
                ) : null}
                <span>· {formatDate(d.created_at)}</span>
              </div>
            </div>
            {statusLabel ? (
              <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${statusLabel.cls}`}>
                {statusLabel.label}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Messages section
// ──────────────────────────────────────────────────────────────────

export function MessagesSection({ messages }: { messages: MessageRow[] }) {
  if (messages.length === 0) {
    return <div className="p-6 text-sm text-ink-3">Aucun email échangé.</div>;
  }
  return (
    <ul className="divide-y divide-line">
      {messages.map((m) => {
        const inbound = m.direction === "inbound";
        const Icon = inbound ? MailOpen : Mail;
        const chip = inbound ? "bg-info-light text-info" : "bg-gold-light text-gold-dark";
        return (
          <li key={m.id} className="p-3 flex items-start gap-3 text-sm">
            <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${chip}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold truncate">
                  {m.subject?.trim() || (inbound ? "Email reçu" : "Email envoyé")}
                </span>
                <span className="text-[11px] text-ink-3">{formatDateTime(m.created_at)}</span>
              </div>
              <div className="text-xs text-ink-2 mt-1 line-clamp-2 whitespace-pre-wrap">
                {m.body.trim().slice(0, 280)}
                {m.body.length > 280 ? "…" : ""}
              </div>
              {m.sender?.full_name ? (
                <div className="text-[11px] text-ink-3 mt-1">par {m.sender.full_name}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Anomalies section
// ──────────────────────────────────────────────────────────────────

const ANOMALY_LABELS: Record<string, string> = {
  no_show_streak: "Absences répétées",
  score_drop: "Score en chute",
  overdue_onboarding: "Onboarding en retard",
  student_quota_near: "Quota étudiant proche",
  cdd_ending: "Fin de CDD imminente",
  trial_decision_due: "Décision de fin d'essai",
  shift_uncovered: "Shift non couvert",
  ghost_employee: "Employé sans activité",
};

export function AnomaliesSection({ anomalies }: { anomalies: AnomalyRow[] }) {
  if (anomalies.length === 0) {
    return <div className="p-6 text-sm text-ink-3">Aucune anomalie ouverte.</div>;
  }
  return (
    <ul className="divide-y divide-line">
      {anomalies.map((a) => {
        const sev =
          a.severity === "critical"
            ? { label: "Critique", cls: "bg-danger-light text-danger", Icon: AlertCircle }
            : a.severity === "warning"
              ? { label: "Warning", cls: "bg-warn-light text-warn", Icon: AlertTriangle }
              : { label: "Info", cls: "bg-info-light text-info", Icon: Info };
        const SevIcon = sev.Icon;
        return (
          <li key={a.id} className="p-3 flex items-start gap-3">
            <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${sev.cls}`}>
              <SevIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${sev.cls}`}>{sev.label}</span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                  {ANOMALY_LABELS[a.kind] ?? a.kind}
                </span>
                <span className="text-[10px] text-ink-3">{formatDate(a.detected_at)}</span>
              </div>
              <div className="font-bold text-sm mt-0.5">{a.title}</div>
              {a.description ? <div className="text-xs text-ink-2 mt-0.5">{a.description}</div> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Onboarding section
// ──────────────────────────────────────────────────────────────────

export function OnboardingSection({
  state,
  employeeId,
}: {
  state: OnboardingState;
  employeeId: string;
}) {
  if (!state) {
    return (
      <div className="p-6 text-sm text-ink-3">
        Aucun parcours d&apos;onboarding démarré pour cet employé.
      </div>
    );
  }
  const { done, total, pct, pendingItems } = state;
  const pctCls = pct >= 100 ? "bg-success" : pct >= 50 ? "bg-gold" : "bg-warn";
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold">
          {done}/{total} items
        </span>
        <span className="text-xs text-ink-3">
          {state.completed_at ? `Terminé le ${formatDate(state.completed_at)}` : "En cours"}
        </span>
        <Link
          href={`/onboarding/${employeeId}`}
          className="ml-auto text-xs font-bold text-gold-dark underline-offset-4 hover:underline"
        >
          Ouvrir le parcours →
        </Link>
      </div>
      <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${pctCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {pendingItems.length > 0 ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3 mb-1">
            À faire ({pendingItems.length})
          </div>
          <ul className="text-sm space-y-1.5">
            {pendingItems.map((it) => (
              <li key={it.id} className="flex items-start gap-2">
                <ClipboardCheck className="h-3.5 w-3.5 mt-0.5 text-ink-3 shrink-0" />
                <span className="flex-1">{it.label}</span>
                {it.is_required ? (
                  <Badge variant="muted" className="text-[9px]">obligatoire</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Planning mini-grid (this week + next 4)
// ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function shiftHours(start: string, end: string, breakMin: number | null): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm) - (breakMin ?? 0);
  return Math.max(0, diff / 60);
}

function isoMonday(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PlanningSection({
  shifts,
  weeklyTarget,
  employeeId,
}: {
  shifts: ShiftRow[];
  weeklyTarget: number | null;
  employeeId: string;
}) {
  const today = new Date();
  const monday = isoMonday(today);

  // Build 5 weeks
  const weeks: Array<{ start: Date; iso: string; label: string; hours: number; days: ShiftRow[][] }> = [];
  for (let w = 0; w < 5; w++) {
    const wStart = new Date(monday);
    wStart.setDate(monday.getDate() + w * 7);
    const wIso = toISODate(wStart);
    const days: ShiftRow[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < 7; i++) {
      const d = new Date(wStart);
      d.setDate(wStart.getDate() + i);
      const dIso = toISODate(d);
      for (const s of shifts) {
        if (s.date === dIso) days[i].push(s);
      }
    }
    let hours = 0;
    for (const dayShifts of days) {
      for (const s of dayShifts) {
        hours += shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0);
      }
    }
    weeks.push({
      start: wStart,
      iso: wIso,
      label:
        w === 0
          ? "Cette semaine"
          : `${formatDate(wStart, { day: "2-digit", month: "short" })}`,
      hours,
      days,
    });
  }

  return (
    <div className="p-4 space-y-3">
      {weeks.map((w) => {
        const target = weeklyTarget ?? 38;
        const pct = target > 0 ? Math.min(100, Math.round((w.hours / target) * 100)) : 0;
        return (
          <div key={w.iso}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-xs font-bold w-[120px]">{w.label}</div>
              <Link
                href={`/planning/calendar?week=${w.iso}&employee=${employeeId}`}
                className="text-xs text-gold-dark hover:underline"
              >
                Ouvrir →
              </Link>
              <div className="ml-auto text-xs font-mono">
                {w.hours.toFixed(1)} / {target}h
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {w.days.map((dayShifts, i) => {
                const dayHours = dayShifts.reduce(
                  (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
                  0,
                );
                const filled = dayShifts.length > 0;
                return (
                  <div
                    key={i}
                    className={`rounded-md p-1.5 text-center text-[10px] ${
                      filled ? "bg-gold-light text-gold-dark" : "bg-surface-2 text-ink-3"
                    }`}
                    title={dayShifts.map((s) => `${s.start_time}–${s.end_time} (${s.status})`).join("\n") || "Aucun shift"}
                  >
                    <div className="font-bold">{DAY_LABELS[i]}</div>
                    <div className="font-mono">{filled ? `${dayHours.toFixed(1)}h` : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Time-off
// ──────────────────────────────────────────────────────────────────

export function TimeOffSection({ items }: { items: TimeOffRow[] }) {
  if (items.length === 0) {
    return <div className="p-6 text-sm text-ink-3">Aucune demande de congé.</div>;
  }
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, 10).map((t) => {
        const cls =
          t.status === "approved"
            ? "bg-success-light text-success"
            : t.status === "rejected"
              ? "bg-danger-light text-danger"
              : "bg-warn-light text-warn";
        return (
          <li key={t.id} className="p-3 flex items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 text-ink-3 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">
                {formatDate(t.start_date)} → {formatDate(t.end_date)}
              </div>
              <div className="text-xs text-ink-3">
                {t.kind ?? "Congé"}
                {t.reason ? ` · ${t.reason}` : ""}
              </div>
            </div>
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{t.status}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Scoring section (employee_metrics + last 3 evaluations)
// ──────────────────────────────────────────────────────────────────

const SCORE_AXES: Array<[string, string]> = [
  ["ponctualite", "Ponctualité"],
  ["presentation", "Présentation"],
  ["communication", "Communication"],
  ["motivation", "Motivation"],
  ["experience", "Expérience"],
  ["polyvalence", "Polyvalence"],
  ["disponibilite", "Disponibilité"],
];

export function ScoringSection({
  metrics,
  evaluations,
  employeeId,
}: {
  metrics: {
    reliability_pct: number | null;
    coverage_pct: number | null;
    shifts_total: number | null;
    shifts_done: number | null;
    shifts_no_show: number | null;
    time_off_days_12m: number | null;
    avg_manager_score: number | null;
    global_score: number | null;
  } | null;
  evaluations: EvaluationRow[];
  employeeId: string;
}) {
  // Axis averages (over all available evaluations)
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
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Score global</div>
          <div className="text-4xl font-extrabold font-mono text-gold-dark">
            {metrics?.global_score != null ? Number(metrics.global_score).toFixed(0) : "—"}
          </div>
          <Link
            href={`/scoring/${employeeId}`}
            className="text-xs text-gold-dark hover:underline mt-1 inline-block"
          >
            Détail scoring →
          </Link>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-[260px]">
          <Info360 label="Fiabilité">
            {metrics?.reliability_pct != null ? `${Number(metrics.reliability_pct).toFixed(0)}%` : "—"}
          </Info360>
          <Info360 label="Couverture">
            {metrics?.coverage_pct != null ? `${Number(metrics.coverage_pct).toFixed(0)}%` : "—"}
          </Info360>
          <Info360 label="Shifts (12m)">
            {`${metrics?.shifts_done ?? 0} / ${metrics?.shifts_total ?? 0}`}
          </Info360>
          <Info360 label="Jours congé">
            {`${metrics?.time_off_days_12m ?? 0}`}
          </Info360>
        </div>
      </div>

      {evaluations.length > 0 ? (
        <>
          <div className="space-y-2 mt-2">
            {SCORE_AXES.map(([k, lbl]) => {
              const avg = axisAverages[k] ?? 0;
              const pct = (avg / 5) * 100;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-semibold">{lbl}</span>
                    <span className="font-mono font-bold">{avg ? avg.toFixed(1) : "—"} / 5</span>
                  </div>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3 mb-1">
              3 dernières évaluations
            </div>
            <ul className="divide-y divide-line border border-line rounded-md">
              {evaluations.slice(0, 3).map((e) => (
                <li key={e.id} className="p-3 text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 fill-gold text-gold shrink-0" />
                  <span className="font-bold font-mono">
                    {e.total != null ? Number(e.total).toFixed(1) : "—"} / 5
                  </span>
                  <span className="text-xs text-ink-3">
                    · {formatDate(e.period_start)} → {formatDate(e.period_end)}
                  </span>
                  <span className="text-xs text-ink-3 ml-auto">
                    par {e.evaluator?.full_name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-3">Aucune évaluation enregistrée.</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Generic anchor menu
// ──────────────────────────────────────────────────────────────────

export function AnchorMenu({
  items,
}: {
  items: Array<{ id: string; label: string; count?: number }>;
}) {
  return (
    <nav className="flex items-center gap-1 flex-wrap text-xs print:hidden">
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className="px-2.5 py-1 rounded-md border border-line bg-surface hover:border-gold hover:text-gold-dark font-semibold transition-colors"
        >
          {it.label}
          {typeof it.count === "number" ? (
            <span className="ml-1 text-ink-3">({it.count})</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
