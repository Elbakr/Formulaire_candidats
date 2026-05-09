import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Star } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate, formatDateTime } from "@/lib/utils";

const SCORE_AXES: Array<[string, string]> = [
  ["fiabilite", "Fiabilité"],
  ["autonomie", "Autonomie"],
  ["esprit_equipe", "Esprit d'équipe"],
  ["qualite", "Qualité du travail"],
  ["presentation", "Présentation"],
];

export default async function ScoringDetailPage(props: PageProps<"/scoring/[employeeId]">) {
  const { employeeId } = await props.params;
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: scoreRow } = await supabase
    .from("employee_scores")
    .select("*")
    .eq("employee_id", employeeId)
    .single();
  if (!scoreRow) notFound();

  const r = scoreRow as unknown as {
    employee_id: string;
    full_name: string;
    job_title: string | null;
    department_name: string | null;
    reliability_pct: number | null;
    coverage_pct: number | null;
    shifts_total: number | null;
    shifts_done: number | null;
    shifts_no_show: number | null;
    time_off_days_12m: number | null;
    avg_manager_score: number | null;
    evals_12m: number | null;
    global_score: number | null;
  };

  const { data: evals } = await supabase
    .from("evaluations")
    .select("id, period_start, period_end, scores, total, comment, created_at, evaluator:profiles(full_name)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);

  const evaluations = (evals ?? []) as unknown as Array<{
    id: string;
    period_start: string;
    period_end: string;
    scores: Record<string, number>;
    total: number;
    comment: string | null;
    created_at: string;
    evaluator: { full_name: string | null } | null;
  }>;

  // Moyennes par axe sur 12 mois
  const axisAverages: Record<string, number> = {};
  if (evaluations.length > 0) {
    for (const [k] of SCORE_AXES) {
      const vals = evaluations.map((e) => e.scores?.[k] ?? 0).filter((v) => v > 0);
      axisAverages[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/scoring"><ArrowLeft className="h-3.5 w-3.5" /> Leaderboard</Link></Button>
        <div className="ml-auto">
          <Button asChild variant="gold">
            <Link href={`/scoring/evaluate/${employeeId}`}><Plus className="h-4 w-4" /> Nouvelle évaluation</Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-5 flex items-start gap-4 flex-wrap">
          <NameAvatar name={r.full_name} className="h-14 w-14 text-base rounded-xl" />
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-bold">{r.full_name}</h1>
            <div className="text-xs text-ink-2 mt-0.5">{r.job_title} · {r.department_name ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Score global</div>
            <div className="text-3xl font-extrabold font-mono text-gold-dark">{Number(r.global_score ?? 0).toFixed(0)}</div>
          </div>
        </div>
        <div className="border-t border-line p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Fiabilité" value={`${Number(r.reliability_pct ?? 100).toFixed(0)}%`} />
          <Stat label="Couverture" value={`${Number(r.coverage_pct ?? 100).toFixed(0)}%`} />
          <Stat label="Shifts (12m)" value={`${r.shifts_done ?? 0} / ${r.shifts_total ?? 0}`} />
          <Stat label="Jours congé" value={`${r.time_off_days_12m ?? 0}`} />
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Évaluations manager (moyennes 12 mois)</h2>
          <p className="text-xs text-ink-3">{r.evals_12m ?? 0} évaluation{(r.evals_12m ?? 0) > 1 ? "s" : ""} dans les 12 derniers mois.</p>
        </div>
        <div className="p-5 space-y-3">
          {SCORE_AXES.map(([k, lbl]) => {
            const avg = axisAverages[k] ?? 0;
            const pct = (avg / 5) * 100;
            return (
              <div key={k}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">{lbl}</span>
                  <span className="font-mono font-bold">{avg ? avg.toFixed(1) : "—"} / 5</span>
                </div>
                <div className="h-2 bg-line rounded-full overflow-hidden">
                  <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Historique des évaluations</h2>
        </div>
        {evaluations.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">Aucune évaluation. Crée la première via le bouton ci-dessus.</div>
        ) : (
          <ul className="divide-y divide-line">
            {evaluations.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Star className="h-4 w-4 fill-gold text-gold" />
                  <span className="font-bold text-sm">{Number(e.total).toFixed(1)} / 5</span>
                  <span className="text-xs text-ink-3">·</span>
                  <span className="text-xs text-ink-3">période {formatDate(e.period_start)} – {formatDate(e.period_end)}</span>
                  <span className="text-xs text-ink-3">·</span>
                  <span className="text-xs text-ink-3">par {e.evaluator?.full_name ?? "—"}</span>
                  <span className="text-xs text-ink-3 ml-auto">{formatDateTime(e.created_at)}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  {SCORE_AXES.map(([k, lbl]) => (
                    <div key={k} className="bg-surface-2 rounded p-2">
                      <div className="text-[10px] text-ink-3 uppercase font-bold">{lbl}</div>
                      <div className="font-mono font-bold">{e.scores?.[k] ?? "—"} / 5</div>
                    </div>
                  ))}
                </div>
                {e.comment ? <p className="mt-2 text-xs text-ink-2 italic">"{e.comment}"</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-base font-bold font-mono mt-0.5">{value}</div>
    </div>
  );
}
