"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateLeaveAutoSettingsAction } from "./actions";

const PERIOD_LABELS: Record<string, { label: string; help: string }> = {
  sales: {
    label: "Soldes (1-31 jan + 1-31 juil)",
    help: "Pic d'activité boutique — escalade manager obligatoire.",
  },
  ramadan_aid: {
    label: "Ramadan + Aïd",
    help: "Détection auto via les jours fériés islamiques (priority ≥ 2).",
  },
  year_end: {
    label: "Fin d'année (15 déc → 15 jan)",
    help: "Période sensible (fêtes, soldes, fermetures partielles).",
  },
  wed_sat: {
    label: "Mercredis & samedis",
    help: "Jours forts boutique — escalade quoi qu'il en soit.",
  },
};

type Initial = {
  min_notice_days: number;
  max_pct_absents: number;
  max_consecutive: number;
  blocked_periods: string[];
};

export function LeaveRulesForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateLeaveAutoSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Règles enregistrées.");
        })
      }
      className="p-5 space-y-5"
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">Seuils d'auto-validation</legend>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="min_notice_days">Préavis minimum (jours)</Label>
            <Input
              id="min_notice_days"
              name="min_notice_days"
              type="number"
              min={0}
              max={365}
              defaultValue={initial.min_notice_days}
            />
            <p className="text-[11px] text-ink-3 mt-0.5">Recommandé : 14 jours.</p>
          </div>
          <div>
            <Label htmlFor="max_consecutive">Durée max (jours consécutifs)</Label>
            <Input
              id="max_consecutive"
              name="max_consecutive"
              type="number"
              min={1}
              max={365}
              defaultValue={initial.max_consecutive}
            />
            <p className="text-[11px] text-ink-3 mt-0.5">Recommandé : 10 jours.</p>
          </div>
          <div>
            <Label htmlFor="max_pct_absents">% max d'absents simultanés / site</Label>
            <Input
              id="max_pct_absents"
              name="max_pct_absents"
              type="number"
              min={0}
              max={100}
              defaultValue={initial.max_pct_absents}
            />
            <p className="text-[11px] text-ink-3 mt-0.5">Recommandé : 30 %.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Périodes interdites (escalade obligatoire)</legend>
        <p className="text-xs text-ink-3">
          Les demandes qui touchent au moins un jour d'une période cochée sont
          systématiquement escaladées au manager, quels que soient les autres seuils.
        </p>
        <div className="grid md:grid-cols-2 gap-2 mt-2">
          {Object.entries(PERIOD_LABELS).map(([key, info]) => (
            <label
              key={key}
              className="flex items-start gap-2 text-sm border border-line rounded-md p-3 hover:bg-surface-2/50"
            >
              <input
                type="checkbox"
                name={`period_${key}`}
                defaultChecked={initial.blocked_periods.includes(key)}
                className="h-4 w-4 mt-0.5 rounded border-line"
              />
              <span>
                <span className="font-bold">{info.label}</span>
                <span className="block text-[11px] text-ink-3 mt-0.5">{info.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
