"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateKpiWeightsAction } from "./actions";
import type { KpiWeights } from "./types";

const FIELDS: Array<{ key: keyof KpiWeights; label: string; help: string }> = [
  { key: "ponctualite", label: "Ponctualité", help: "% shifts effectués à l'heure (clock-in vs début du shift)." },
  { key: "fiabilite", label: "Fiabilité", help: "1 - taux de no-show / annulations sur 12 mois." },
  { key: "heures_vs_prevu", label: "Heures vs prévu", help: "Couverture : heures réellement effectuées vs heures planifiées." },
  { key: "absences", label: "Absences imprévues", help: "Pénalité linéaire selon nb d'absences imprévues sur 60 jours." },
  { key: "rating_hebdo", label: "Note hebdo manager", help: "Moyenne 1-5 des notes hebdomadaires (12 dernières semaines)." },
  { key: "ventes", label: "Ventes (WooCommerce)", help: "Reporté — laisse à 0 jusqu'à intégration boutique." },
];

export function KpiWeightsForm({ initial }: { initial: KpiWeights }) {
  const [values, setValues] = useState<KpiWeights>(initial);
  const [pending, startTransition] = useTransition();
  const total =
    values.ponctualite +
    values.fiabilite +
    values.heures_vs_prevu +
    values.absences +
    values.rating_hebdo +
    values.ventes;

  function update(key: keyof KpiWeights, raw: string) {
    const n = Number(raw);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 }));
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateKpiWeightsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Pondération KPI enregistrée.");
        })
      }
      className="p-5 space-y-4"
    >
      <div className="grid md:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-end justify-between mb-1.5">
              <Label htmlFor={f.key} className="mb-0">{f.label}</Label>
              <span className="text-[11px] text-ink-3 font-mono font-bold">{values[f.key]}%</span>
            </div>
            <Input
              id={f.key}
              name={f.key}
              type="number"
              min={0}
              max={100}
              value={values[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
            />
            <p className="text-[11px] text-ink-3 mt-1">{f.help}</p>
          </div>
        ))}
      </div>

      <div
        className={`rounded-md p-3 text-sm font-bold flex items-center justify-between ${
          total === 100
            ? "bg-success-light text-success"
            : "bg-danger-light text-danger"
        }`}
      >
        <span>Total</span>
        <span className="font-mono">{total} / 100</span>
      </div>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" disabled={pending || total !== 100}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
