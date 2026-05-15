import Link from "next/link";
import { ArrowRight, Star, Clock, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { RecomputeButton } from "./recompute-button";
import { formatDateTime } from "@/lib/utils";
import { loadPunctualityForEmployees } from "@/lib/scoring/punctuality";
import { loadValidationReliabilityForEmployees } from "@/lib/scoring/validation-reliability";

type Row = {
  employee_id: string;
  full_name: string;
  job_title: string | null;
  department_name: string | null;
  status: string;
  reliability_pct: number | null;
  coverage_pct: number | null;
  shifts_total: number | null;
  time_off_days_12m: number | null;
  avg_manager_score: number | null;
  evals_12m: number | null;
  global_score: number | null;
  metrics_updated_at: string | null;
  manager_id: string | null;
};

export default async function ScoringHomePage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  let query = supabase.from("employee_scores").select("*").eq("status", "active");
  if (profile.role === "manager") {
    query = query.eq("manager_id", profile.id);
  }
  const { data } = await query.order("global_score", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const lastUpdate = rows.find((r) => r.metrics_updated_at)?.metrics_updated_at;

  // Ponctualite : computed TS-side a partir de clock_entries vs shifts (3 mois).
  // Karim 14/05/2026 : rendu visible dans le scoring pour rendre tangible la
  // rigueur observee, en attendant migration DB pour integrer au global_score.
  const [punctualityByEmp, validationByEmp] = await Promise.all([
    loadPunctualityForEmployees(rows.map((r) => r.employee_id), 3),
    // Karim 15/05/2026 : fiabilite post-validation. Penalise les annulations
    // apres validation acceptee. 6 mois de fenetre pour avoir assez de signal.
    loadValidationReliabilityForEmployees(rows.map((r) => r.employee_id), 6),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Scoring équipe</h1>
          <p className="text-sm text-ink-2">
            Score global = 50% évaluations manager + 50% métriques auto. {rows.length} employé·e·s actif·ve·s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate ? <span className="text-[11px] text-ink-3">Métriques MAJ {formatDateTime(lastUpdate)}</span> : null}
          <RecomputeButton />
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Pas encore d'employé actif scoré.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r, i) => (
              <div
                key={r.employee_id}
                className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
              >
                <div className="w-7 text-center font-mono font-bold text-ink-3 shrink-0">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <EmployeeQuickLink
                    employeeId={r.employee_id}
                    fullName={r.full_name}
                    withAvatar
                    avatarSize="md"
                    variant="block"
                    fullWidth
                    subtitle={<>{r.job_title} · {r.department_name ?? "—"}</>}
                    primaryHref={`/scoring/${r.employee_id}`}
                  />
                </div>
                <div className="hidden md:flex flex-col items-end text-xs text-ink-2 mr-2 shrink-0">
                  <span>Fiabilité : <span className="font-mono font-bold">{Number(r.reliability_pct ?? 100).toFixed(0)}%</span></span>
                  <span>Couverture : <span className="font-mono font-bold">{Number(r.coverage_pct ?? 100).toFixed(0)}%</span></span>
                  {(() => {
                    const p = punctualityByEmp.get(r.employee_id);
                    if (!p || p.samples === 0) {
                      return (
                        <span className="text-ink-3 italic">Ponctualité : —</span>
                      );
                    }
                    const tone =
                      p.band === "exemplary"
                        ? "text-success"
                        : p.band === "ok"
                          ? "text-ink-2"
                          : p.band === "attention"
                            ? "text-warn"
                            : "text-danger";
                    return (
                      <span
                        title={`${p.samples} shifts evalues sur 3 mois. Ponctuels : ${p.punctual_pct.toFixed(0)}%, retards 5-15 min : ${p.late_pct.toFixed(0)}%, >15 min : ${p.very_late_pct.toFixed(0)}%. Retard moyen : ${p.avg_late_minutes.toFixed(1)} min.`}
                        className={`inline-flex items-center gap-1 ${tone}`}
                      >
                        <Clock className="h-3 w-3" />
                        Ponctualité : <span className="font-mono font-bold">{p.rigor_score.toFixed(0)}%</span>
                      </span>
                    );
                  })()}
                  {(() => {
                    const v = validationByEmp.get(r.employee_id);
                    if (!v || v.accepted + v.refused + v.cancelled_after_validation === 0) {
                      return (
                        <span className="text-ink-3 italic">Fiabilité validation : —</span>
                      );
                    }
                    const tone =
                      v.band === "exemplary"
                        ? "text-success"
                        : v.band === "ok"
                          ? "text-ink-2"
                          : v.band === "attention"
                            ? "text-warn"
                            : "text-danger";
                    return (
                      <span
                        title={`${v.accepted} validations honorees, ${v.cancelled_after_validation} annulees apres validation, ${v.refused} refus directs (6 mois). Score = penalite forte sur annulations.`}
                        className={`inline-flex items-center gap-1 ${tone}`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Fiabilité validation : <span className="font-mono font-bold">{v.score.toFixed(0)}%</span>
                      </span>
                    );
                  })()}
                </div>
                <ScoreBadge score={Number(r.global_score ?? 0)} />
                {r.avg_manager_score != null ? (
                  <div className="hidden lg:flex items-center gap-1 text-xs text-ink-3 shrink-0">
                    <Star className="h-3 w-3 fill-gold text-gold" />
                    <span className="font-mono font-bold">{Number(r.avg_manager_score).toFixed(1)}</span>
                    <span>·</span>
                    <span>{r.evals_12m ?? 0} eval{(r.evals_12m ?? 0) > 1 ? "s" : ""}</span>
                  </div>
                ) : (
                  <div className="hidden lg:block text-xs text-ink-3 shrink-0">Pas d'éval</div>
                )}
                <Link
                  href={`/scoring/${r.employee_id}`}
                  aria-label={`Détails ${r.full_name}`}
                  className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-3 hover:text-gold-dark hover:bg-gold-light"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-success-light text-success" :
    score >= 70 ? "bg-gold-light text-gold-dark" :
    score >= 55 ? "bg-warn-light text-warn" :
    "bg-danger-light text-danger";
  return (
    <div className={`rounded-md px-3 py-1.5 font-mono font-extrabold text-base ${color}`}>
      {score.toFixed(0)}
    </div>
  );
}
