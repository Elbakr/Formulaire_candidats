"use client";

// Karim 2026-07-08 : ajout rapide d'un manquement DEPUIS le cockpit d'évaluation.
// Petit champ + bouton « + Manquement » : consigne un écart constaté pendant
// l'évaluation sans quitter la page. Anti double-clic via useTransition/disabled.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { addEvaluationComplianceEventAction } from "../../actions";

export function QuickComplianceAdd({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [malus, setMalus] = useState(1);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Manquement
      </Button>
    );
  }

  const submit = () => {
    const t = title.trim();
    if (!t) {
      toast.error("Décris le manquement.");
      return;
    }
    start(async () => {
      const res = await addEvaluationComplianceEventAction({ employeeId, title: t, malus });
      if (res.ok) {
        toast.success("Manquement consigné.");
        setTitle("");
        setMalus(1);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Enregistrement impossible.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Manquement constaté (ex. retard répété, tenue non conforme…)"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-ink-3">Malus</label>
        <Input
          type="number"
          min={0}
          max={10}
          value={malus}
          onChange={(e) => setMalus(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          className="w-16"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              setTitle("");
              setMalus(1);
            }}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button variant="gold" size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Consigner
          </Button>
        </div>
      </div>
    </div>
  );
}
