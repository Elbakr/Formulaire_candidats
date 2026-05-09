"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAiSettingsAction } from "./actions";
import { toast } from "sonner";

type Settings = {
  ai_autonomy_level: number | null;
  ai_provider: string | null;
  ai_model_strong: string | null;
  ai_model_fast: string | null;
  ai_budget_usd_monthly: number | null;
};

const AUTONOMY_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "0 — Suggestion uniquement (humain valide tout)" },
  { value: "1", label: "1 — Auto sur cas triviaux (whitelist)" },
  { value: "2", label: "2 — Auto étendu (confiance ≥ 0.85)" },
  { value: "3", label: "3 — Autonome (sauf liste noire)" },
];

export function AiSettingsForm({ initial }: { initial: Settings }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveAiSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Paramètres IA enregistrés.");
        })
      }
      className="p-5 space-y-3 max-w-xl"
    >
      <div>
        <Label htmlFor="ai_autonomy_level">Niveau d&apos;autonomie</Label>
        <Select name="ai_autonomy_level" defaultValue={String(initial.ai_autonomy_level ?? 0)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTONOMY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ai_provider">Provider</Label>
          <Input
            id="ai_provider"
            name="ai_provider"
            defaultValue={initial.ai_provider ?? "anthropic"}
          />
        </div>
        <div>
          <Label htmlFor="ai_budget_usd_monthly">Budget mensuel ($)</Label>
          <Input
            id="ai_budget_usd_monthly"
            name="ai_budget_usd_monthly"
            type="number"
            step="0.01"
            defaultValue={String(initial.ai_budget_usd_monthly ?? 50)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ai_model_strong">Modèle strong</Label>
          <Input
            id="ai_model_strong"
            name="ai_model_strong"
            defaultValue={initial.ai_model_strong ?? "claude-sonnet-4-6"}
          />
        </div>
        <div>
          <Label htmlFor="ai_model_fast">Modèle fast</Label>
          <Input
            id="ai_model_fast"
            name="ai_model_fast"
            defaultValue={initial.ai_model_fast ?? "claude-haiku-4-5-20251001"}
          />
        </div>
      </div>

      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "…" : "Enregistrer"}
      </Button>
    </form>
  );
}
