// Analytics dashboard — funnel + couverture + sources + KPIs.
//
// Server component. All queries run in parallel.
// Period selector lives in `analytics-filters.tsx` (client) and writes to the URL.

import Link from "next/link";
import { ArrowRight, ArrowDown, ArrowUp, AlertTriangle, Sparkles, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startOfWeek, addDays, toISODate } from "@/lib/planning";
import {
  computeFunnel,
  conversionRates,
  buildStages,
  deltaConversion,
  type AppStatusRow,
} from "@/lib/analytics/funnel";
import {
  computeCoverage,
  bandColor,
  bandLabel,
  sumHours,
  type DepartmentRow,
  type EmployeeRow,
  type ShiftRow,
} from "@/lib/analytics/coverage";
import { computeSources, topPerformingSource, type CandidateRow, type ApplicationRow } from "@/lib/analytics/sources";
import { AnalyticsFilters, type PeriodKey } from "./analytics-filters";

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
};

// ---------------------------------------------------------------------------
// Period bounds helpers — return inclusive [startISO, endISO] (full ISO strings).
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function periodBounds(period: PeriodKey, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "this_week": {
      const m = startOfWeek(now);
      return { start: m, end: endOfDay(addDays(m, 6)) };
    }
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: s, end: endOfDay(e) };
    }
    case "last_30d": {
      const e = endOfDay(now);
      const s = startOfDay(addDays(now, -29));
      return { start: s, end: e };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1);
      const e = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { start: s, end: endOfDay(e) };
    }
    case "this_year": {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31);
      return { start: s, end: endOfDay(e) };
    }
    case "custom": {
      const s = from ? new Date(from + "T00:00:00") : startOfDay(addDays(now, -29));
      const e = to ? new Date(to + "T23:59:59.999") : endOfDay(now);
      return { start: s, end: e };
    }
  }
}

function previousMonthBounds(now: Date): { start: Date; end: Date } {
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const e = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: s, end: endOfDay(e) };
}

function thisYearBounds(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(new Date(now.getFullYear(), 11, 31)) };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AnalyticsPage(props: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "rh"]);
  const sp = await props.searchParams;
  const period = (sp.period as PeriodKey) || "this_month";
  const { start: pStart, end: pEnd } = periodBounds(period, sp.from, sp.to);

  const supabase = await createClient();
  const now = new Date();
  const { start: pmStart, end: pmEnd } = previousMonthBounds(now);
  const { start: yearStart, end: yearEnd } = thisYearBounds(now);

  // Coverage windows : current week + next week
  const monday = startOfWeek(now);
  const curWeekStart = toISODate(monday);
  const curWeekEnd = toISODate(addDays(monday, 6));
  const nextWeekStart = toISODate(addDays(monday, 7));
  const nextWeekEnd = toISODate(addDays(monday, 13));

  // 90 days
  const d90Start = startOfDay(addDays(now, -89));
  // 30d (worked)
  const d30Start = startOfDay(addDays(now, -29));
  // 7d activity
  const d7Start = startOfDay(addDays(now, -6));
  // Next 30d for scheduled hours
  const d30Forward = addDays(now, 30);

  const [
    appsAllRes,
    candidatesAllRes,
    departmentsRes,
    employeesRes,
    shiftsCurWeekRes,
    shiftsNextWeekRes,
    shiftsLast30Res,
    shiftsNext30Res,
    topScoresRes,
    attentionScoresRes,
    activeAnomaliesRes,
    pendingDocsRes,
    statusChanges7dRes,
    messages7dRes,
    documents7dRes,
    hires7dRes,
  ] = await Promise.all([
    // Pull everything in this year so we can slice client-side for several windows.
    // .range(0, 49999) lifts the default 1000-row cap from PostgREST.
    supabase
      .from("applications")
      .select("id, candidate_id, status, created_at, updated_at")
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString())
      .range(0, 49999),
    supabase
      .from("candidates")
      .select("id, source, created_at")
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString())
      .range(0, 49999),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("employees")
      .select("id, full_name, department_id, weekly_hours, status")
      .eq("status", "active"),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", curWeekStart)
      .lte("date", curWeekEnd),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", nextWeekStart)
      .lte("date", nextWeekEnd),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", toISODate(d30Start))
      .lte("date", toISODate(now)),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", toISODate(now))
      .lte("date", toISODate(d30Forward)),
    supabase
      .from("employee_scores")
      .select("employee_id, full_name, global_score, job_title, department_name")
      .eq("status", "active")
      .order("global_score", { ascending: false })
      .limit(5),
    supabase
      .from("employee_scores")
      .select("employee_id, full_name, global_score, job_title, department_name, shifts_no_show")
      .eq("status", "active")
      .order("global_score", { ascending: true })
      .limit(5),
    supabase
      .from("anomaly_flags")
      .select("id, severity", { count: "exact", head: true })
      .is("resolved_at", null)
      .in("severity", ["critical", "warning"]),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("validation_status", "pending"),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("kind", "application.status_changed")
      .gte("created_at", d7Start.toISOString()),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("created_at", d7Start.toISOString()),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", d7Start.toISOString()),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "hired")
      .gte("updated_at", d7Start.toISOString()),
  ]);

  const appsAll = (appsAllRes.data ?? []) as unknown as Array<AppStatusRow & { candidate_id: string; updated_at: string | null }>;
  const candidatesAll = (candidatesAllRes.data ?? []) as unknown as CandidateRow[];
  const departments = (departmentsRes.data ?? []) as unknown as DepartmentRow[];
  const employees = (employeesRes.data ?? []) as unknown as Array<EmployeeRow & { full_name: string }>;
  const shiftsCurWeek = (shiftsCurWeekRes.data ?? []) as unknown as ShiftRow[];
  const shiftsNextWeek = (shiftsNextWeekRes.data ?? []) as unknown as ShiftRow[];
  const shiftsLast30 = (shiftsLast30Res.data ?? []) as unknown as ShiftRow[];
  const shiftsNext30 = (shiftsNext30Res.data ?? []) as unknown as ShiftRow[];
  const topScores = (topScoresRes.data ?? []) as unknown as Array<{
    employee_id: string; full_name: string; global_score: number | null; job_title: string | null; department_name: string | null;
  }>;
  const attentionScores = (attentionScoresRes.data ?? []) as unknown as Array<{
    employee_id: string; full_name: string; global_score: number | null; job_title: string | null; department_name: string | null; shifts_no_show: number | null;
  }>;

  // Slice for funnel periods
  const inRange = (iso: string, s: Date, e: Date) => {
    const t = new Date(iso).getTime();
    return t >= s.getTime() && t <= e.getTime();
  };
  const appsPeriod: AppStatusRow[] = appsAll.filter((a) => inRange(a.created_at, pStart, pEnd));
  const appsPrevMonth: AppStatusRow[] = appsAll.filter((a) => inRange(a.created_at, pmStart, pmEnd));
  const appsYear: AppStatusRow[] = appsAll;

  const funnelP = computeFunnel(appsPeriod);
  const funnelPM = computeFunnel(appsPrevMonth);
  const funnelY = computeFunnel(appsYear);
  const ratesP = conversionRates(funnelP);
  const stagesP = buildStages(funnelP);
  const conversionDelta = deltaConversion(funnelP, funnelPM);

  // Sources : restrict to candidates created in the same period for the metrics
  const candPeriod = candidatesAll.filter((c) => inRange(c.created_at, pStart, pEnd));
  const sourceMetrics = computeSources(candPeriod, appsPeriod as unknown as ApplicationRow[]);
  const topSrc = topPerformingSource(sourceMetrics);

  // Coverage
  const coverageThisWeek = computeCoverage(departments, employees, shiftsCurWeek);
  const coverageNextWeek = computeCoverage(departments, employees, shiftsNextWeek);

  // KPIs
  const totalActive = employees.length;
  const avgScore = topScores.length === 0 && attentionScores.length === 0
    ? 0
    : (() => {
        const all = [...topScores, ...attentionScores];
        const seen = new Set<string>();
        const uniq = all.filter((x) => { if (seen.has(x.employee_id)) return false; seen.add(x.employee_id); return true; });
        if (uniq.length === 0) return 0;
        return uniq.reduce((acc, x) => acc + Number(x.global_score ?? 0), 0) / uniq.length;
      })();
  const hoursLast30 = sumHours(shiftsLast30);
  const hoursNext30 = sumHours(shiftsNext30);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-ink-2">
            {fmtDate(pStart)} — {fmtDate(pEnd)} · funnel, couverture, sources, KPIs.
          </p>
        </div>
        <AnalyticsFilters period={period} from={sp.from ?? ""} to={sp.to ?? ""} />
      </div>

      {/* ============== A. Funnel recrutement ============== */}
      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-bold">Funnel recrutement</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              {funnelP.received} candidatures sur la période · {funnelPM.received} le mois précédent · {funnelY.received} cette année.
            </p>
          </div>
          <DeltaBadge value={conversionDelta} suffix="pp" label="taux d'embauche vs mois précédent" />
        </div>
        <div className="p-5 grid lg:grid-cols-2 gap-5">
          <FunnelSvg stages={stagesP} />
          <div className="space-y-3">
            <RateRow label="Reçu → Contacté" pct={ratesP.contacted_of_received} />
            <RateRow label="Contacté → RDV planifié" pct={ratesP.rdv_scheduled_of_contacted} />
            <RateRow label="RDV planifié → RDV fait" pct={ratesP.rdv_done_of_rdv_scheduled} />
            <RateRow label="RDV fait → Embauché" pct={ratesP.hired_of_rdv_done} />
            <div className="pt-2 border-t border-line" />
            <RateRow
              label="Reçu → Embauché"
              pct={ratesP.hired_of_received}
              tone="hero"
            />
          </div>
        </div>
      </Card>

      {/* ============== B. Sources ============== */}
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Sources de candidatures</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Performance par canal d'acquisition sur la période.
            {topSrc ? (
              <> Top : <span className="font-semibold text-gold-dark">{topSrc.label}</span> ({topSrc.hire_rate_pct.toFixed(1)}%).</>
            ) : null}
          </p>
        </div>
        {sourceMetrics.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Pas de candidatures sur la période.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                  <Th>Source</Th>
                  <Th align="right">Candidats</Th>
                  <Th align="right">Candidatures</Th>
                  <Th align="right">Embauches</Th>
                  <Th align="right">Taux</Th>
                  <Th align="right">Délai (j)</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sourceMetrics.map((m) => (
                  <tr key={m.source} className="hover:bg-surface-2">
                    <Td>
                      <span className="font-semibold">{m.label}</span>
                    </Td>
                    <Td align="right" mono>{m.total_candidates}</Td>
                    <Td align="right" mono>{m.applications}</Td>
                    <Td align="right" mono>{m.hires}</Td>
                    <Td align="right" mono>
                      <span className={m.hire_rate_pct >= 10 ? "text-success" : m.hire_rate_pct > 0 ? "text-gold-dark" : "text-ink-3"}>
                        {m.hire_rate_pct.toFixed(1)}%
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {m.avg_time_to_hire_days == null ? "—" : m.avg_time_to_hire_days.toFixed(1)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ============== C. Couverture par site ============== */}
      <div className="grid lg:grid-cols-2 gap-4">
        <CoverageCard
          title="Couverture cette semaine"
          subtitle={`${curWeekStart} → ${curWeekEnd}`}
          rows={coverageThisWeek}
        />
        <CoverageCard
          title="Couverture semaine prochaine"
          subtitle={`${nextWeekStart} → ${nextWeekEnd}`}
          rows={coverageNextWeek}
        />
      </div>

      {/* ============== D. Top employés / Attention ============== */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold">Top 5 employés</h2>
            <p className="text-xs text-ink-3 mt-0.5">Score global le plus élevé (90 derniers jours).</p>
          </div>
          {topScores.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Pas encore de score calculé.</div>
          ) : (
            <ul className="divide-y divide-line">
              {topScores.map((s, i) => (
                <li key={s.employee_id}>
                  <Link href={`/scoring/${s.employee_id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors">
                    <div className="w-6 text-center font-mono font-bold text-ink-3">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{s.full_name}</div>
                      <div className="text-xs text-ink-3 truncate">{s.job_title ?? "—"} · {s.department_name ?? "—"}</div>
                    </div>
                    <div className="font-mono font-extrabold text-success">{Number(s.global_score ?? 0).toFixed(0)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold">Attention requise</h2>
            <p className="text-xs text-ink-3 mt-0.5">Score bas, no-shows ou onboarding incomplet.</p>
          </div>
          {attentionScores.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Personne dans le rouge. Bravo.</div>
          ) : (
            <ul className="divide-y divide-line">
              {attentionScores.map((s) => (
                <li key={s.employee_id}>
                  <Link href={`/scoring/${s.employee_id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{s.full_name}</div>
                      <div className="text-xs text-ink-3 truncate">
                        {s.job_title ?? "—"} · {s.department_name ?? "—"}
                        {(s.shifts_no_show ?? 0) > 0 ? <> · <span className="text-danger font-semibold">{s.shifts_no_show} no-show</span></> : null}
                      </div>
                    </div>
                    <div className={`font-mono font-extrabold ${Number(s.global_score ?? 0) < 55 ? "text-danger" : "text-warn"}`}>
                      {Number(s.global_score ?? 0).toFixed(0)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ============== E. KPIs équipe ============== */}
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">KPIs équipe globale</h2>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Employés actifs" value={totalActive} sublabel="status = active" />
          <Kpi label="Score moyen" value={avgScore.toFixed(0)} sublabel="Top 10 + bottom 5" />
          <Kpi label="Heures travaillées" value={hoursLast30.toFixed(0)} sublabel="30 derniers jours" />
          <Kpi label="Heures planifiées" value={hoursNext30.toFixed(0)} sublabel="30 prochains jours" />
          <Kpi
            label="Anomalies actives"
            value={activeAnomaliesRes.count ?? 0}
            sublabel="critique + warning"
            tone={(activeAnomaliesRes.count ?? 0) > 0 ? "warn" : "ok"}
          />
          <Kpi
            label="Docs à valider"
            value={pendingDocsRes.count ?? 0}
            sublabel="validation_status = pending"
            tone={(pendingDocsRes.count ?? 0) > 5 ? "warn" : "ok"}
          />
        </div>
      </Card>

      {/* ============== F. Activité 7j ============== */}
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Activité (7 derniers jours)</h2>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Mvts pipeline" value={statusChanges7dRes.count ?? 0} sublabel="changements de statut" />
          <Kpi label="Emails envoyés" value={messages7dRes.count ?? 0} sublabel="messages outbound" />
          <Kpi label="Documents reçus" value={documents7dRes.count ?? 0} sublabel="uploads candidats/employés" />
          <Kpi label="Nouvelles embauches" value={hires7dRes.count ?? 0} sublabel="status passé à hired" />
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/analytics/sites">
            Détail par site <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (server)
// ---------------------------------------------------------------------------

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`px-3 py-2 font-bold ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({
  children,
  align = "left",
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${mono ? "font-mono" : ""}`}>
      {children}
    </td>
  );
}

function Kpi({
  label, value, sublabel, tone = "ok",
}: { label: string; value: number | string; sublabel?: string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "border-warn bg-warn-light" : "border-line bg-surface";
  return (
    <div className={`rounded-[var(--radius)] border p-3 ${cls}`}>
      <div className="text-2xl font-extrabold font-mono leading-none">{value}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-bold text-ink-3">{label}</div>
      {sublabel ? <div className="text-[10px] text-ink-2 mt-0.5">{sublabel}</div> : null}
    </div>
  );
}

function DeltaBadge({ value, suffix = "%", label }: { value: number; suffix?: string; label?: string }) {
  const up = value > 0.05;
  const down = value < -0.05;
  const cls = up
    ? "bg-success-light text-success"
    : down
    ? "bg-danger-light text-danger"
    : "bg-surface-2 text-ink-2";
  const Icon = up ? ArrowUp : down ? ArrowDown : Sparkles;
  return (
    <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${cls}`} title={label}>
      <Icon className="h-3 w-3" />
      <span className="font-mono">{value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}</span>
    </div>
  );
}

function RateRow({ label, pct, tone }: { label: string; pct: number; tone?: "hero" }) {
  const isHero = tone === "hero";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={isHero ? "font-extrabold uppercase tracking-wider text-[10px]" : "font-semibold"}>{label}</span>
        <span className={`font-mono font-extrabold ${isHero ? "text-base text-gold-dark" : ""}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-line rounded-full overflow-hidden">
        <div
          className={isHero ? "h-full bg-gradient-to-r from-gold to-gold-dark" : "h-full bg-gold"}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function FunnelSvg({ stages }: { stages: Array<{ key: string; label: string; count: number; pctOfTotal: number }> }) {
  const W = 360;
  const H = 240;
  const padX = 8;
  const stageH = H / stages.length;
  const maxW = W - padX * 2;
  // First stage = 100%; each subsequent stage = % of total received.
  return (
    <div className="flex items-center justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] h-auto">
        <defs>
          <linearGradient id="funnelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8a96e" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>
        </defs>
        {stages.map((s, i) => {
          const next = stages[i + 1];
          const wTop = Math.max(40, (s.pctOfTotal / 100) * maxW);
          const wBot = next ? Math.max(40, (next.pctOfTotal / 100) * maxW) : Math.max(40, wTop * 0.6);
          const yTop = i * stageH;
          const yBot = yTop + stageH - 4;
          const cx = W / 2;
          const points = [
            `${cx - wTop / 2},${yTop}`,
            `${cx + wTop / 2},${yTop}`,
            `${cx + wBot / 2},${yBot}`,
            `${cx - wBot / 2},${yBot}`,
          ].join(" ");
          return (
            <g key={s.key}>
              <polygon points={points} fill="url(#funnelGrad)" opacity={0.9 - i * 0.12} />
              <text
                x={cx}
                y={yTop + stageH / 2 - 2}
                textAnchor="middle"
                fill="#fff"
                fontSize="11"
                fontWeight="700"
              >
                {s.label}
              </text>
              <text
                x={cx}
                y={yTop + stageH / 2 + 12}
                textAnchor="middle"
                fill="#fff"
                fontSize="13"
                fontWeight="800"
                style={{ fontFamily: "ui-monospace, monospace" }}
              >
                {s.count} · {s.pctOfTotal.toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CoverageCard({
  title, subtitle, rows,
}: {
  title: string;
  subtitle: string;
  rows: ReturnType<typeof computeCoverage>;
}) {
  const hasData = rows.some((r) => r.target_hours > 0 || r.planned_hours > 0);
  return (
    <Card>
      <div className="p-4 border-b border-line">
        <h2 className="font-bold flex items-center gap-2"><Users className="h-4 w-4 text-gold-dark" /> {title}</h2>
        <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>
      </div>
      {!hasData ? (
        <div className="p-6 text-center text-sm text-ink-3">Pas de planning ni de cible définis.</div>
      ) : (
        <div className="p-4 space-y-3">
          {rows.map((r) => {
            const widthPct = Math.min(120, r.coverage_pct);
            return (
              <div key={r.department_id ?? "none"}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="font-semibold flex items-center gap-2">
                    <span>{r.name}</span>
                    <span className="text-[10px] text-ink-3">({r.active_employees} actif·s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-ink-2">{r.planned_hours.toFixed(0)}h / {r.target_hours.toFixed(0)}h</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                      ${r.band === "danger" ? "bg-danger-light text-danger"
                        : r.band === "warn" ? "bg-warn-light text-warn"
                        : r.band === "ok" ? "bg-success-light text-success"
                        : "bg-gold-light text-gold-dark"}`}>
                      {r.coverage_pct.toFixed(0)}% · {bandLabel(r.band)}
                    </span>
                  </div>
                </div>
                <div className="relative h-2 bg-line rounded-full overflow-hidden">
                  {/* 100% reference line */}
                  <div className="absolute top-0 bottom-0 w-px bg-ink-3 z-10" style={{ left: `${(100 / 120) * 100}%` }} />
                  <div className={`h-full ${bandColor(r.band)}`} style={{ width: `${(widthPct / 120) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
