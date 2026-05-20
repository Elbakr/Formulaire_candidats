"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Flame, Loader2, ChevronDown, Maximize2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  autoFillEmployeeContractualAction,
  autoFillEmployeeOvertimeAction,
} from "./auto-fill-actions";
import {
  fillExtendExistingShiftsAction,
  fillCreateMiniShiftsAction,
} from "./fill-residual-actions";

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

  // Karim 20/05 : strategies residuel (extend / mini-shifts)
  function execExtend() {
    startTransition(async () => {
      const r = await fillExtendExistingShiftsAction({ employeeId, weekISO });
      if (r.error) { toast.error(r.error); return; }
      const ext = r.extended ?? 0;
      const min = r.minutes_added ?? 0;
      const remMin = r.remaining_min ?? 0;
      if (ext === 0) {
        toast.warning(
          remMin > 0
            ? `Aucun shift n a pu etre rallonge (conflits). Reste ${(remMin/60).toFixed(1)}h. Essaie 'Mini-shifts'.`
            : "Quota deja sature, rien a rallonger.",
          { duration: 8000 },
        );
      } else {
        toast.success(
          `${ext} shift(s) rallonge(s), +${min} min ajoutees.${remMin > 0 ? ` Reste ${(remMin/60).toFixed(1)}h non placees.` : ""}`,
          { duration: 7000 },
        );
      }
      router.refresh();
    });
  }
  function execMini() {
    startTransition(async () => {
      const r = await fillCreateMiniShiftsAction({ employeeId, weekISO });
      if (r.error) { toast.error(r.error); return; }
      const cre = r.created ?? 0;
      const min = r.minutes_added ?? 0;
      const remMin = r.remaining_min ?? 0;
      if (cre === 0) {
        toast.warning(
          remMin > 0
            ? `Aucun mini-shift place (pas de creneau libre). Reste ${(remMin/60).toFixed(1)}h.`
            : "Quota deja sature, rien a creer.",
          { duration: 8000 },
        );
      } else {
        toast.success(
          `${cre} mini-shift(s) crees, +${min} min ajoutees (pause 15min entre shifts).${remMin > 0 ? ` Reste ${(remMin/60).toFixed(1)}h non placees.` : ""}`,
          { duration: 7000 },
        );
      }
      router.refresh();
    });
  }

  // Phase 1 : dropdown avec 3 strategies
  if (phase === "contractual") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Boucher contractuel <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-3">
            Choisir la stratégie
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={exec} className="flex-col items-start gap-0.5 cursor-pointer">
            <span className="font-bold text-sm flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Solver standard
            </span>
            <span className="text-[11px] text-ink-3 leading-snug">
              Crée de nouveaux shifts collés aux site_needs + reclasse les OT existants → contractuel.
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={execExtend} className="flex-col items-start gap-0.5 cursor-pointer">
            <span className="font-bold text-sm flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" /> Rallonger les shifts existants
            </span>
            <span className="text-[11px] text-ink-3 leading-snug">
              Étire le end_time des shifts contractuels existants jusqu'à saturer le quota (plafond 23h59 ou prochain shift).
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={execMini} className="flex-col items-start gap-0.5 cursor-pointer">
            <span className="font-bold text-sm flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Créer mini-shifts (pause 15min)
            </span>
            <span className="text-[11px] text-ink-3 leading-snug">
              Crée de nouveaux shifts courts (15min-4h) avec 15min de pause après les shifts existants. Pour combler 6h par fragments si besoin.
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
