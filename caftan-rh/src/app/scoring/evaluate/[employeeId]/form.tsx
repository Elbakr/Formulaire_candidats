"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEvaluationAction } from "../../actions";
import { todayISOInBrussels } from "@/lib/datetime";
import { toast } from "sonner";

// Helpers dates pures "YYYY-MM-DD" (indépendants du fuseau, arithmétique UTC).
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function mondayOfWeekISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

// 7 axes Discovery (recrutement.html EVAL_CRIT)
const AXES: Array<[string, string, string]> = [
  ["ponctualite", "Ponctualité", "Présence, respect des horaires"],
  ["presentation", "Présentation", "Tenue, attitude face aux clients"],
  ["communication", "Communication", "Aisance verbale, écoute, clarté"],
  ["motivation", "Motivation", "Engagement, énergie, envie d'apprendre"],
  ["experience", "Expérience", "Maîtrise du poste, savoir-faire"],
  ["polyvalence", "Polyvalence", "Capacité à changer de tâche/site"],
  ["disponibilite", "Disponibilité", "Souplesse horaire, week-ends, dépannage"],
];

export function EvaluationForm({
  employeeId,
  contractStart = null,
  contractEnd = null,
}: {
  employeeId: string;
  contractStart?: string | null;
  contractEnd?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(AXES.map(([k]) => [k, 4])),
  );

  const today = todayISOInBrussels();
  // Karim 2026-07-08 : défaut = période du CONTRAT (début du contrat -> fin, ou
  // aujourd'hui si CDI/fin nulle). Fallback -3 mois si aucune date de contrat.
  const initialStart = contractStart ?? addDaysISO(mondayOfWeekISO(today), -84); // ~3 mois
  const initialEnd = contractEnd ?? today;
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);

  const setRange = (start: string, end: string) => {
    setPeriodStart(start);
    setPeriodEnd(end);
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0) / AXES.length;

  return (
    <form
      action={(fd) => {
        fd.set("employee_id", employeeId);
        fd.set("period_start", periodStart);
        fd.set("period_end", periodEnd);
        for (const [k] of AXES) fd.set(`score_${k}`, String(scores[k]));
        startTransition(async () => {
          const r = await createEvaluationAction(fd);
          if (r?.error) toast.error(r.error);
          else {
            toast.success("Évaluation enregistrée.");
            router.push(`/scoring/${employeeId}`);
          }
        });
      }}
      className="p-5 space-y-5"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-3">Période rapide :</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRange(addDaysISO(today, -1), addDaysISO(today, -1))}>
            Hier
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRange(today, today)}>
            Aujourd&apos;hui
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRange(mondayOfWeekISO(today), today)}>
            Cette semaine
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!contractStart}
            onClick={() => setRange(contractStart ?? today, contractEnd ?? today)}
          >
            Période du contrat
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="period_start">Période évaluée — du</Label>
            <Input id="period_start" name="period_start" type="date" value={periodStart} onChange={(ev) => setPeriodStart(ev.target.value)} required />
          </div>
          <div>
            <Label htmlFor="period_end">au</Label>
            <Input id="period_end" name="period_end" type="date" value={periodEnd} onChange={(ev) => setPeriodEnd(ev.target.value)} required />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {AXES.map(([k, label, hint]) => (
          <div key={k}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-[11px] text-ink-3">{hint}</div>
              </div>
              <div className="font-mono text-lg font-bold w-10 text-right">{scores[k]}/5</div>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScores((s) => ({ ...s, [k]: n }))}
                  className={`flex-1 h-9 rounded-md border-2 transition-all font-bold ${
                    scores[k] === n
                      ? "bg-gold border-gold text-white"
                      : scores[k] >= n
                        ? "bg-gold-light border-gold-light text-gold-dark"
                        : "bg-surface border-line text-ink-3 hover:border-gold"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="comment">Commentaire</Label>
        <Textarea id="comment" name="comment" rows={3} placeholder="Points forts, axes d'amélioration…" />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-line">
        <div className="text-sm">
          <span className="text-ink-3">Score moyen : </span>
          <span className="font-mono text-xl font-extrabold text-gold-dark">{total.toFixed(2)} / 5</span>
        </div>
        <Button type="submit" variant="gold" size="lg" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer l'évaluation"}
        </Button>
      </div>
    </form>
  );
}
