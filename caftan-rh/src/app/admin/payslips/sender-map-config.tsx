"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { updatePayslipSenderMap, type SenderMapEntry } from "./sender-map-actions";

const EMPLOYER_LABELS: Record<string, string> = {
  amd_megastore: "AMD Megastore",
  caftan_factory: "Caftan Factory",
};

export function SenderMapConfig({ initial }: { initial: SenderMapEntry[] }) {
  const [entries, setEntries] = useState<SenderMapEntry[]>(initial);
  const [pending, startTransition] = useTransition();

  function addEntry() {
    setEntries((prev) => [...prev, { pattern: "", employer: "amd_megastore" }]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePattern(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, pattern: value } : e)),
    );
  }

  function updateEmployer(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, employer: value as SenderMapEntry["employer"] }
          : e,
      ),
    );
  }

  function save() {
    startTransition(async () => {
      const r = await updatePayslipSenderMap(entries);
      if (r?.error) toast.error(r.error);
      else toast.success("Expéditeurs autorisés enregistrés.");
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm">Expéditeurs de fiches de paie autorisés</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Si l&apos;adresse ou le nom de l&apos;expéditeur contient le <strong>pattern</strong> (insensible à la casse),
        la fiche est attribuée à l&apos;employeur sélectionné.
        Ces règles sont testées <strong>avant</strong> les patterns intégrés
        (hrconsult, partena, securex…).
      </p>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Aucun expéditeur personnalisé. Cliquez sur « Ajouter » pour en définir un.
        </p>
      )}

      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Pattern (ex. elbazikarim@gmail.com)"
              value={entry.pattern}
              onChange={(e) => updatePattern(i, e.target.value)}
              className="flex-1 text-sm font-mono"
            />
            <select
              value={entry.employer}
              onChange={(e) => updateEmployer(i, e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="amd_megastore">AMD Megastore</option>
              <option value="caftan_factory">Caftan Factory</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeEntry(i)}
              title="Supprimer"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="w-4 h-4 mr-1" />
          Ajouter un expéditeur
        </Button>
        <Button
          type="button"
          variant="gold"
          size="sm"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="text-xs text-muted-foreground bg-slate-50 rounded p-3 space-y-1 border border-slate-200">
          <p className="font-medium text-slate-700">Récapitulatif actuel :</p>
          {entries.map((e, i) => (
            <p key={i}>
              • <code className="font-mono">{e.pattern || "(vide)"}</code>{" "}
              → <strong>{EMPLOYER_LABELS[e.employer] ?? e.employer}</strong>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
