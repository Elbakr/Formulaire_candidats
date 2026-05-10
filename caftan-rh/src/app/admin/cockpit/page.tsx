import Link from "next/link";
import { Users, Briefcase, CalendarDays, FileBarChart, AlertCircle, ArrowRight, Star, AlertTriangle, RefreshCw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { startOfWeek, addDays, toISODate } from "@/lib/planning";
import { formatDate } from "@/lib/utils";
import {
  fetchAtRisk,
  fetchUpcomingCddEnds,
  fetchUnusualAbsenteeism,
} from "@/lib/performance-shared";

export default async function CockpitPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const today = toISODate(new Date());
  const monday = toISODate(startOfWeek(new Date()));
  const sunday = toISODate(addDays(startOfWeek(new Date()), 6));
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { count: totalCands },
    { count: newCandsWeek },
    { count: pendingApps },
    { count: totalEmps },
    { count: pendingTimeOff },
    { count: shiftsThisWeek },
    { data: pipelineRaw },
    { data: topScores },
    { data: upcomingTrials },
    { data: anomaliesRaw },
  ] = await Promise.all([
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase.from("applications").select("id", { count: "exact", head: true }).in("status", ["new", "contacted"]),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("time_off_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("shifts").select("id", { count: "exact", head: true }).gte("date", monday).lte("date", sunday),
    supabase.from("applications").select("status"),
    supabase.from("employee_scores").select("employee_id, full_name, global_score, job_title").eq("status", "active").order("global_score", { ascending: false }).limit(5),
    supabase.from("employees").select("id, full_name, trial_end_date, contract_type").eq("status", "active").not("trial_end_date", "is", null).order("trial_end_date", { ascending: true }).limit(5),
    supabase
      .from("anomaly_flags")
      .select("id, kind, severity, title, target_type, target_id, detected_at")
      .is("resolved_at", null)
      .eq("severity", "critical")
      .order("detected_at", { ascending: false })
      .limit(5),
  ]);

  const pipelineCounts: Record<string, number> = {};
  for (const r of (pipelineRaw ?? []) as { status: string }[]) {
    pipelineCounts[r.status] = (pipelineCounts[r.status] ?? 0) + 1;
  }

  // Module 5 — Performance équipe.
  const [atRisk, cddUpcoming, absUnusual] = await Promise.all([
    fetchAtRisk(supabase, { managerId: null, limit: 5 }),
    fetchUpcomingCddEnds(supabase, { managerId: null, limit: 5 }),
    fetchUnusualAbsenteeism(supabase, { managerId: null, limit: 5 }),
  ]);

  type CritAnomaly = {
    id: string;
    kind: string;
    title: string;
    target_type: string;
    target_id: string | null;
    detected_at: string;
  };
  const criticalAnomalies = (anomaliesRaw ?? []) as unknown as CritAnomaly[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Cockpit exécutif</h1>
        <p className="text-sm text-ink-2">Vue d'ensemble en un coup d'œil — tout ce qui mérite ton attention.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Candidatures" value={totalCands ?? 0} sublabel={`+${newCandsWeek ?? 0} ce mois`} href="/rh/candidates" />
        <KpiCard label="À traiter" value={pendingApps ?? 0} sublabel="Nouveaux + contactés" tone={(pendingApps ?? 0) > 50 ? "warn" : "ok"} href="/rh/candidates" />
        <KpiCard label="Employés actifs" value={totalEmps ?? 0} href="/planning/employees" />
        <KpiCard label="Shifts cette semaine" value={shiftsThisWeek ?? 0} href="/planning/calendar" />
        <KpiCard label="Congés en attente" value={pendingTimeOff ?? 0} tone={(pendingTimeOff ?? 0) > 0 ? "warn" : "ok"} href="/planning/time-off" />
        <KpiCard label="Embauches (engagés)" value={pipelineCounts["hired"] ?? 0} href="/rh/pipeline" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold">Pipeline recrutement</h2>
            <Button asChild variant="ghost" size="sm"><Link href="/rh/pipeline">Détails <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          <div className="p-4 space-y-2">
            {[
              ["new", "Nouveaux", "bg-info-light text-info"],
              ["contacted", "Contactés", "bg-info-light text-info"],
              ["rdv_scheduled", "RDV planifié", "bg-warn-light text-warn"],
              ["rdv_done", "RDV fait", "bg-success-light text-success"],
              ["wait_decision", "En attente", "bg-violet-light text-violet"],
              ["hired", "Embauchés", "bg-success text-white"],
              ["refused", "Refusés", "bg-danger-light text-danger"],
            ].map(([key, label, cls]) => {
              const c = pipelineCounts[key] ?? 0;
              const total = Object.values(pipelineCounts).reduce((a, b) => a + b, 0) || 1;
              const pct = (c / total) * 100;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold">{label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{c}</span>
                  </div>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold">Top 5 employés (score)</h2>
            <Button asChild variant="ghost" size="sm"><Link href="/scoring">Voir tout <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          {(topScores ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Pas encore de score calculé.</div>
          ) : (
            <ul className="divide-y divide-line">
              {(topScores as unknown as Array<{ employee_id: string; full_name: string; global_score: number; job_title: string | null }>).map((s, i) => (
                <li key={s.employee_id} className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors">
                  <div className="w-6 text-center font-mono font-bold text-ink-3 shrink-0">#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={s.employee_id}
                      fullName={s.full_name}
                      variant="block"
                      fullWidth
                      subtitle={s.job_title ?? undefined}
                      primaryHref={`/scoring/${s.employee_id}`}
                    />
                  </div>
                  <div className="font-mono font-extrabold text-gold-dark shrink-0">{Number(s.global_score ?? 0).toFixed(0)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-bold">Anomalies critiques (top 5)</h2>
            <p className="text-xs text-ink-3 mt-0.5">Détectées par le scan automatique.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/anomalies">Tout voir <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
        {criticalAnomalies.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Rien à signaler. Tout est sous contrôle.</div>
        ) : (
          <ul className="divide-y divide-line">
            {criticalAnomalies.map((a) => (
              <li key={a.id} className="p-3 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-danger" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{a.title}</div>
                  <div className="text-xs text-ink-3 truncate">{a.kind} · {a.target_type}</div>
                </div>
                <Link href="/admin/anomalies" className="text-[11px] font-bold text-gold-dark hover:underline">
                  Voir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <h2 className="text-lg font-bold mb-2">Performance équipe</h2>
        <div className="grid lg:grid-cols-3 gap-4">
          <Card>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" /> 5 employés à risque</h3>
              <Button asChild variant="ghost" size="sm">
                <Link href="/scoring">Détails <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            </div>
            {atRisk.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-3">Personne à risque.</div>
            ) : (
              <ul className="divide-y divide-line">
                {atRisk.map((r) => (
                  <li key={r.employee_id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <EmployeeQuickLink
                        employeeId={r.employee_id}
                        fullName={r.full_name}
                        variant="block"
                        fullWidth
                        subtitle={r.reasons.join(" · ")}
                        primaryHref={`/scoring/${r.employee_id}`}
                      />
                    </div>
                    <div className="font-mono font-bold text-danger shrink-0">{Number(r.global_score ?? 0).toFixed(0)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><RefreshCw className="h-4 w-4 text-warn" /> Alertes CDD ≤ 30j</h3>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/cdd-renewals">Décider <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            </div>
            {cddUpcoming.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-3">Pas de CDD à échéance proche.</div>
            ) : (
              <ul className="divide-y divide-line">
                {cddUpcoming.map((c) => (
                  <li key={c.employee_id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <EmployeeQuickLink
                        employeeId={c.employee_id}
                        fullName={c.full_name}
                        variant="block"
                        fullWidth
                        subtitle={`Fin contrat ${formatDate(c.end_date)} · J-${c.days_remaining}`}
                      />
                    </div>
                    {c.has_pending ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-info-light text-info shrink-0">
                        Fiche prête
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-warn-light text-warn shrink-0">
                        À préparer
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="p-4 border-b border-line">
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> Absentéisme anormal</h3>
              <p className="text-xs text-ink-3 mt-0.5">{`> 3 absences imprévues / 60j`}</p>
            </div>
            {absUnusual.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-3">Aucun signal anormal.</div>
            ) : (
              <ul className="divide-y divide-line">
                {absUnusual.map((a) => (
                  <li key={a.employee_id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <EmployeeQuickLink
                        employeeId={a.employee_id}
                        fullName={a.full_name}
                        variant="block"
                        fullWidth
                        subtitle={`${a.absence_count} absence${a.absence_count > 1 ? "s" : ""} en 60 jours`}
                      />
                    </div>
                    <div className="font-mono font-bold text-danger shrink-0">{a.absence_count}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold">⚠ Périodes d'essai à venir</h2>
            <p className="text-xs text-ink-3 mt-0.5">Décide avant la fin pour ne pas être pris au dépourvu.</p>
          </div>
          {(upcomingTrials ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Aucune période d'essai active.</div>
          ) : (
            <ul className="divide-y divide-line">
              {(upcomingTrials as unknown as Array<{ id: string; full_name: string; trial_end_date: string; contract_type: string | null }>).map((e) => (
                <li key={e.id} className="p-3 flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 text-warn shrink-0" />
                  <div className="flex-1 min-w-0">
                    <EmployeeQuickLink
                      employeeId={e.id}
                      fullName={e.full_name}
                      variant="block"
                      fullWidth
                      subtitle={
                        <>{e.contract_type ?? "—"} · fin essai {formatDate(e.trial_end_date)}</>
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold">Raccourcis</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/admin/integrations/gravity-forms"><Briefcase className="h-3.5 w-3.5" /> Gravity Forms</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/templates"><FileBarChart className="h-3.5 w-3.5" /> Templates emails</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/payroll"><FileBarChart className="h-3.5 w-3.5" /> Export paie</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/users"><Users className="h-3.5 w-3.5" /> Utilisateurs</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/planning/calendar"><CalendarDays className="h-3.5 w-3.5" /> Planning</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/scoring"><Star className="h-3.5 w-3.5" /> Scoring</Link></Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sublabel, href, tone = "ok",
}: { label: string; value: number | string; sublabel?: string; href?: string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "border-warn bg-warn-light" : "border-line bg-surface hover:border-gold";
  const inner = (
    <div className={`rounded-[var(--radius)] border p-3 transition-colors ${cls}`}>
      <div className="text-2xl font-extrabold font-mono leading-none">{value}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-bold text-ink-3">{label}</div>
      {sublabel ? <div className="text-[10px] text-ink-2 mt-0.5">{sublabel}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
