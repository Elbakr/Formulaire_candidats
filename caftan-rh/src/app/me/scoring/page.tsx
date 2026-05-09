import { Star, FileBarChart } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/utils";

const SCORE_AXES: Array<[string, string]> = [
  ["fiabilite", "Fiabilité"],
  ["autonomie", "Autonomie"],
  ["esprit_equipe", "Esprit d'équipe"],
  ["qualite", "Qualité du travail"],
  ["presentation", "Présentation"],
];

export default async function MyScoringPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, job_title")
    .eq("profile_id", user.id)
    .maybeSingle();
  const employee = emp as unknown as { id: string; full_name: string; job_title: string | null } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Mon score</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <FileBarChart className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Tu n'es pas encore enregistré comme employé.</p>
          </div>
        </Card>
      </div>
    );
  }

  const [{ data: scoreRow }, { data: evals }] = await Promise.all([
    supabase.from("employee_scores").select("*").eq("employee_id", employee.id).single(),
    supabase
      .from("evaluations")
      .select("id, period_start, period_end, scores, total, comment, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const r = scoreRow as unknown as {
    reliability_pct: number | null;
    coverage_pct: number | null;
    shifts_total: number | null;
    shifts_done: number | null;
    time_off_days_12m: number | null;
    global_score: number | null;
    avg_manager_score: number | null;
  } | null;

  const evaluations = (evals ?? []) as unknown as Array<{
    id: string;
    period_start: string;
    period_end: string;
    scores: Record<string, number>;
    total: number;
    comment: string | null;
    created_at: string;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mon score</h1>
        <p className="text-sm text-ink-2">Résumé de tes performances vues par ton manager + métriques auto.</p>
      </div>

      <Card>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Score global</div>
            <div className="text-4xl font-extrabold font-mono text-gold-dark">
              {Number(r?.global_score ?? 0).toFixed(0)}
              <span className="text-base text-ink-3 font-normal">/100</span>
            </div>
          </div>
          {r?.avg_manager_score != null ? (
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Moyenne manager</div>
              <div className="text-2xl font-extrabold font-mono flex items-center gap-1">
                <Star className="h-5 w-5 fill-gold text-gold" />
                {Number(r.avg_manager_score).toFixed(1)}<span className="text-sm text-ink-3 font-normal">/5</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="border-t border-line p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Fiabilité" value={`${Number(r?.reliability_pct ?? 100).toFixed(0)}%`} />
          <Stat label="Couverture" value={`${Number(r?.coverage_pct ?? 100).toFixed(0)}%`} />
          <Stat label="Shifts (12m)" value={`${r?.shifts_done ?? 0} / ${r?.shifts_total ?? 0}`} />
          <Stat label="Jours congé" value={`${r?.time_off_days_12m ?? 0}`} />
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Mes évaluations</h2>
        </div>
        {evaluations.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">Aucune évaluation pour l'instant.</div>
        ) : (
          <ul className="divide-y divide-line">
            {evaluations.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Star className="h-4 w-4 fill-gold text-gold" />
                  <span className="font-bold text-sm">{Number(e.total).toFixed(1)} / 5</span>
                  <span className="text-xs text-ink-3">·</span>
                  <span className="text-xs text-ink-3">période {formatDate(e.period_start)} – {formatDate(e.period_end)}</span>
                  <span className="text-xs text-ink-3 ml-auto">{formatDateTime(e.created_at)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  {SCORE_AXES.map(([k, lbl]) => (
                    <div key={k} className="bg-surface-2 rounded p-1.5 text-center">
                      <div className="text-[9px] text-ink-3 uppercase font-bold truncate">{lbl}</div>
                      <div className="font-mono font-bold">{e.scores?.[k] ?? "—"}</div>
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
