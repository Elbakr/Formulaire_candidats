"use client";

// Karim 2026-07-11 : déclenche le batch global de génération des plannings (tous les
// employés). Confirmation avant lancement (action lourde), toast récap au retour.

import { useState, useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateAllProposalsAction } from "./generate-all-actions";

export function GenerateAllProposalsButton() {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    setConfirming(false);
    start(async () => {
      try {
        const r = await generateAllProposalsAction();
        if (!r.ok) {
          toast.error(r.error ?? "Échec de la génération.");
          return;
        }
        const parts = [`${r.okCount}/${r.total} planning(s) généré(s)`];
        if (r.alerts) parts.push(`${r.alerts} en alerte`);
        if (r.failed) parts.push(`${r.failed} en échec`);
        toast.success(parts.join(" · "));
      } catch {
        toast.error("Échec de la génération.");
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button variant="gold" size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          Confirmer pour tous
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Annuler
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setConfirming(true)}
      disabled={pending}
      title="Régénère la proposition de planning de TOUS les employés actifs (variante par défaut conservée)"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5 mr-1" />
      )}
      Générer plannings (tous)
    </Button>
  );
}
