"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAcquisitionConfigAction } from "./actions";
import type { AcquisitionConfig } from "./types";

type Field = {
  key: keyof AcquisitionConfig;
  label: string;
  help: string;
  unit: string;
  min: number;
  max: number;
};

const FIELDS: Field[] = [
  {
    key: "min_score_to_hire",
    label: "Score minimum d'embauche",
    help: 'Score minimum (0–100) au pré-entretien pour déclencher la recommandation "HIRE". En dessous de ce seuil − 10, la recommandation est "PASS".',
    unit: "%",
    min: 0,
    max: 100,
  },
  {
    key: "pre_interview_relance_days",
    label: "Délai de relance pré-entretien",
    help: "Nombre de jours après l'envoi du pré-entretien sans complétion avant d'envoyer une relance automatique au candidat.",
    unit: "jours",
    min: 1,
    max: 30,
  },
  {
    key: "interview_planning_window_days",
    label: "Fenêtre de planification d'entretien",
    help: "Nombre de jours ouvrables proposés au candidat pour choisir un créneau d'entretien physique après validation du pré-entretien.",
    unit: "jours",
    min: 1,
    max: 90,
  },
];

export function AcquisitionConfigForm({ initial }: { initial: AcquisitionConfig }) {
  const [values, setValues] = useState<AcquisitionConfig>(initial);
  const [pending, startTransition] = useTransition();

  function update(key: keyof AcquisitionConfig, raw: string) {
    const n = Number(raw);
    setValues((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) ? n : prev[key],
    }));
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateAcquisitionConfigAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Configuration enregistrée.");
        })
      }
      className="p-5 space-y-5"
    >
      <div className="grid md:grid-cols-3 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-end justify-between mb-1.5">
              <Label htmlFor={f.key} className="mb-0">
                {f.label}
              </Label>
              <span className="text-[11px] text-ink-3 font-mono font-bold">
                {values[f.key]} {f.unit}
              </span>
            </div>
            <Input
              id={f.key}
              name={f.key}
              type="number"
              min={f.min}
              max={f.max}
              value={values[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
            />
            <p className="text-[11px] text-ink-3 mt-1">{f.help}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
