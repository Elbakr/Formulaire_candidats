"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  autoFillEmployeeContractualAction,
  autoFillEmployeeOvertimeAction,
} from "./auto-fill-actions";

type Phase = "contractual" | "overtime";

export function EmployeeAutoFillButton({
  employeeId,
  weekISO,
}: {
  employeeId: string;
  weekISO: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("contractual");
  const [pending, startTransition] = useTransition();

  function exec() {
    if (phase === "contractual") {
      startTransition(async () => {
        const r = await autoFillEmployeeContractualAction({ employeeId, weekISO });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const created = r.created ?? 0;
        const reclass = r.reclassified ?? 0;
        const otPending = r.ot_pending ?? 0;
        const parts: string[] = [];
        if (created > 0) parts.push(`${created} shift(s) contractuel(s) créé(s)`);
        if (reclass > 0) parts.push(`${reclass} OT reclassé(s) en contractuel`);
        if (parts.length === 0 && otPending === 0) {
          toast.success("Quota contractuel déjà saturé. Rien à faire.");
        } else if (parts.length === 0 && otPending > 0) {
          toast.warning(
            `Contractuel déjà saturé. ${otPending} proposition(s) d'heures sup disponible(s) — clique encore pour les valider.`,
            { duration: 6000 },
          );
          setPhase("overtime");
        } else {
          toast.success(
            `${parts.join(" · ")}.${otPending > 0 ? ` ${otPending} OT en attente — clique pour le réservoir d'heures sup.` : ""}`,
            { duration: 7000 },
          );
          if (otPending > 0) setPhase("overtime");
        }
        router.refresh();
      });
    } else {
      startTransition(async () => {
        const r = await autoFillEmployeeOvertimeAction({ employeeId, weekISO });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const otCreated = r.ot_created ?? 0;
        if (otCreated === 0) {
          toast.success("Aucune heure sup à créer.");
        } else {
          toast.success(
            `${otCreated} shift(s) d'heures sup créé(s) pour cet employé.`,
            { duration: 6000 },
          );
        }
        setPhase("contractual");
        router.refresh();
      });
    }
  }

  if (phase === "contractual") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={exec}
        disabled={pending}
        title="Utiliser le réservoir contractuel restant de cet employé"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        Boucher contractuel
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exec}
      disabled={pending}
      className="border-orange-300 text-orange-700 hover:bg-orange-100"
      title="Créer les shifts d'heures sup proposés par le solver"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
      🔥 Réservoir d&apos;heures sup
    </Button>
  );
}
