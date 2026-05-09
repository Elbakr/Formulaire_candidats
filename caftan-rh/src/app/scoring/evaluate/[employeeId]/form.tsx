"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEvaluationAction } from "../../actions";
import { toast } from "sonner";

const AXES: Array<[string, string, string]> = [
  ["fiabilite", "Fiabilité", "Présence, ponctualité, respect des engagements"],
  ["autonomie", "Autonomie", "Capacité à travailler sans supervision"],
  ["esprit_equipe", "Esprit d'équipe", "Communication, entraide"],
  ["qualite", "Qualité du travail", "Précision, soin, rigueur"],
  ["presentation", "Présentation", "Tenue, attitude face aux clients"],
];

export function EvaluationForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(AXES.map(([k]) => [k, 4])),
  );

  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const defaultStart = start.toISOString().split("T")[0];

  const total = Object.values(scores).reduce((a, b) => a + b, 0) / AXES.length;

  return (
    <form
      action={(fd) => {
        fd.set("employee_id", employeeId);
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
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="period_start">Période évaluée — du</Label>
          <Input id="period_start" name="period_start" type="date" defaultValue={defaultStart} required />
        </div>
        <div>
          <Label htmlFor="period_end">au</Label>
          <Input id="period_end" name="period_end" type="date" defaultValue={defaultEnd} required />
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
