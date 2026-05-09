import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RecomputeButton } from "./recompute-button";
import { formatDateTime } from "@/lib/utils";

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
              <Link
                key={r.employee_id}
                href={`/scoring/${r.employee_id}`}
                className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
              >
                <div className="w-7 text-center font-mono font-bold text-ink-3">#{i + 1}</div>
                <NameAvatar name={r.full_name} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{r.full_name}</div>
                  <div className="text-xs text-ink-3 truncate">{r.job_title} · {r.department_name ?? "—"}</div>
                </div>
                <div className="hidden md:flex flex-col items-end text-xs text-ink-2 mr-2">
                  <span>Fiabilité : <span className="font-mono font-bold">{Number(r.reliability_pct ?? 100).toFixed(0)}%</span></span>
                  <span>Couverture : <span className="font-mono font-bold">{Number(r.coverage_pct ?? 100).toFixed(0)}%</span></span>
                </div>
                <ScoreBadge score={Number(r.global_score ?? 0)} />
                {r.avg_manager_score != null ? (
                  <div className="hidden lg:flex items-center gap-1 text-xs text-ink-3">
                    <Star className="h-3 w-3 fill-gold text-gold" />
                    <span className="font-mono font-bold">{Number(r.avg_manager_score).toFixed(1)}</span>
                    <span>·</span>
                    <span>{r.evals_12m ?? 0} eval{(r.evals_12m ?? 0) > 1 ? "s" : ""}</span>
                  </div>
                ) : (
                  <div className="hidden lg:block text-xs text-ink-3">Pas d'éval</div>
                )}
                <ArrowRight className="h-4 w-4 text-ink-3 ml-1" />
              </Link>
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
