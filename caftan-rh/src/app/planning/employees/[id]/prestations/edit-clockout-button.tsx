"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { correctClockOutAction } from "./actions";

/**
 * Bouton inline "Modifier" affichee a cote du badge AUTO-OUT, reservee
 * admin/rh (le server-side de l'action verifie aussi le role). Ouvre un dialog
 * avec un input time pre-rempli sur l'heure auto, soumet correctClockOutAction.
 *
 * Karim 2026-05-24 : on garde le DATE part inchangee et on n'edite que HH:MM
 * (cas usage = "l'employee est sorti a 19:00 et pas a 22:00 quand le site a
 * ferme"). Si Karim a un jour besoin de corriger aussi le jour, on remplacera
 * par un datetime-local.
 */
export function EditClockOutButton({
  clockOutEntryId,
  currentOccurredAt,
  employeeId,
}: {
  clockOutEntryId: string;
  currentOccurredAt: string;
  employeeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Pre-remplit avec l'heure courante (locale, HH:MM).
  const initialTime = (() => {
    const d = new Date(currentOccurredAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  })();
  const [time, setTime] = useState(initialTime);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Heure invalide (HH:MM)");
      return;
    }
    // Reconstruit le ISO avec la date d'origine + nouvelle heure locale.
    const base = new Date(currentOccurredAt);
    const [h, m] = time.split(":").map(Number);
    base.setHours(h, m, 0, 0);
    const iso = base.toISOString();

    startTransition(async () => {
      const res = await correctClockOutAction(clockOutEntryId, iso, employeeId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("OUT corrigé.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-50 transition-colors"
        title="Modifier l'heure de sortie auto"
      >
        <Pencil className="h-2.5 w-2.5" />
        Modifier
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Corriger l&apos;heure de sortie</DialogTitle>
            <DialogDescription>
              Auto-OUT généré automatiquement à la fermeture du site. Indique
              l&apos;heure réelle de sortie de l&apos;employé. Le pointage
              passera en OUT manuel.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="clockout-time">Nouvelle heure de sortie</Label>
              <Input
                id="clockout-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={60}
                required
                disabled={pending}
              />
              <p className="text-[11px] text-ink-3">
                Heure actuelle (auto) : <span className="font-mono">{initialTime}</span>
              </p>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
