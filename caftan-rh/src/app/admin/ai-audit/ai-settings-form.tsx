"use client";

import { useState, useTransition } from "react";
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

const AUTONOMY_OPTIONS: { value: string; label: string; helper: string }[] = [
  {
    value: "0",
    label: "Niveau 0 — Manuel (humain valide tout)",
    helper:
      "Mode par défaut. Toutes les actions IA passent par l'Inbox et attendent une validation humaine. Aucune action automatique.",
  },
  {
    value: "1",
    label: "Niveau 1 — Auto sur cas triviaux (whitelist)",
    helper:
      "Active l'auto-exécution pour : accusé de réception, classification spam, tag de pièce jointe, item d'onboarding cocheable. Confiance IA requise ≥ 95 %.",
  },
  {
    value: "2",
    label: "Niveau 2 — Auto étendu (relances incluses)",
    helper:
      "Niveau 1 + relance automatique J+5 sur candidatures sans réponse. ATTENTION : envoie de vrais emails aux candidats.",
  },
  {
    value: "3",
    label: "Niveau 3 — Autonomie complète (mode expert)",
    helper:
      "DANGER : tous les use-cases IA, y compris décisions de routage. Réservé aux scénarios pilotes après audit. Black-list : rejet, signature contrat, embauche, fire.",
  },
];

export function AiSettingsForm({ initial }: { initial: Settings }) {
  const [pending, startTransition] = useTransition();
  const [level, setLevel] = useState<string>(String(initial.ai_autonomy_level ?? 0));
  const helper = AUTONOMY_OPTIONS.find((o) => o.value === level)?.helper ?? "";
  const isDangerous = level === "2" || level === "3";
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
        <Select name="ai_autonomy_level" value={level} onValueChange={setLevel}>
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
        {helper ? (
          <p
            className={`text-xs mt-1 ${isDangerous ? "text-warn font-semibold" : "text-ink-3"}`}
          >
            {isDangerous ? "⚠ " : ""}
            {helper}
          </p>
        ) : null}
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
