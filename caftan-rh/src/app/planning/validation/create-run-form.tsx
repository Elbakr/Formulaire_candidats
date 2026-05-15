"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createValidationRunAction } from "./actions";

export function CreateRunForm({ defaultWeekISO }: { defaultWeekISO: string }) {
  const router = useRouter();
  const [weekISO, setWeekISO] = useState(defaultWeekISO);
  const [deadline, setDeadline] = useState<string>("");
  const [bypass, setBypass] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createValidationRunAction({
            weekISO,
            deadlineAt: deadline || null,
            bypassMandatory: bypass,
            bypassReason: bypass ? bypassReason : undefined,
          });
          if (r.error) toast.error(r.error);
          else {
            toast.success("Demande de validation créée. Les employés peuvent maintenant valider leur planning.");
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="weekISO">Semaine (lundi)</Label>
        <Input
          id="weekISO"
          type="date"
          value={weekISO}
          onChange={(e) => setWeekISO(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="deadline">Deadline (optionnel)</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-xs flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={bypass}
            onChange={(e) => setBypass(e.target.checked)}
            className="cursor-pointer"
          />
          <span>
            <strong>Bypass de l obligation</strong> — appliquer immédiatement, sans attendre validation
          </span>
        </label>
        {bypass ? (
          <Input
            placeholder="Raison du bypass (urgence opérationnelle, ferme demain, etc.)"
            value={bypassReason}
            onChange={(e) => setBypassReason(e.target.value)}
            className="mt-1"
          />
        ) : null}
      </div>
      <div className="md:col-span-4 flex gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Création…" : "Créer la demande"}
        </Button>
        <p className="text-[11px] text-ink-3 self-center">
          La détection rush est automatique selon la semaine choisie. Si rush détecté, le run est marqué obligatoire.
        </p>
      </div>
    </form>
  );
}
