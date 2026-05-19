"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  autoFillSiteContractualAction,
  autoFillSiteOvertimeAction,
} from "./auto-fill-actions";

type Phase = "contractual" | "overtime";

/**
 * Karim 19/05 : bouton 2-phases pour boucher les uncovered automatiquement.
 *  - Phase 1 ("Boucher contractuel ⚡") : commit phase 1 sans dialog.
 *    Apres succes, bascule en phase 2.
 *  - Phase 2 ("Réservoir d heures sup 🔥") : auto-pick le 1er candidat OT
 *    par slot uncovered, commit en bulk.
 *
 * Si Karim recharge la page (router.refresh apres commit) et qu il y a
 * encore des uncovered en DB, le bouton reste en phase 2 jusqu a que
 * Karim re-vide ou re-clique (alors il revient en phase 1).
 */
export function AutoFillButton({
  siteCode,
  weekISO,
}: {
  siteCode: string;
  weekISO: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("contractual");
  const [pending, startTransition] = useTransition();

  function exec() {
    if (phase === "contractual") {
      startTransition(async () => {
        const r = await autoFillSiteContractualAction({ siteCode, weekISO });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const created = r.created ?? 0;
        const uncovered = r.uncovered_count ?? 0;
        if (created === 0 && uncovered === 0) {
          toast.success("Tout est déjà couvert, rien à faire.");
        } else if (created === 0 && uncovered > 0) {
          toast.warning(
            `0 contractuel possible — ${uncovered} créneau(x) manquant(s). Bascule en mode heures sup.`,
            { duration: 6000 },
          );
          setPhase("overtime");
        } else if (uncovered > 0) {
          toast.success(
            `${created} shift(s) contractuel(s) créé(s). ${uncovered} créneau(x) restant(s) — clique à nouveau pour le réservoir d'heures sup.`,
            { duration: 7000 },
          );
          setPhase("overtime");
        } else {
          toast.success(`${created} shift(s) contractuel(s) créé(s). Tout est couvert.`);
        }
        router.refresh();
      });
    } else {
      startTransition(async () => {
        const r = await autoFillSiteOvertimeAction({ siteCode, weekISO });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const otCreated = r.ot_created ?? 0;
        const unfilled = r.unfilled_count ?? 0;
        const otHours = r.ot_hours_total ?? 0;
        if (otCreated === 0 && unfilled === 0) {
          toast.success("Aucun créneau OT à combler. Tout est déjà couvert.");
        } else if (otCreated > 0) {
          toast.success(
            `${otCreated} shift(s) OT créé(s) (~${otHours.toFixed(1)}h sup).${unfilled > 0 ? ` ${unfilled} créneau(x) toujours sans candidat.` : ""}`,
            { duration: 8000 },
          );
        } else {
          toast.warning(
            `${unfilled} créneau(x) manquant(s), mais aucun candidat OT disponible (tous au max, tous off, ou tous en conflit).`,
            { duration: 8000 },
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
        title="Boucher les créneaux manquants avec le réservoir d'heures contractuelles"
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
      title="Combler les créneaux restants avec des heures supplémentaires (auto-pick du 1er candidat éligible)"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
      🔥 Réservoir d&apos;heures sup
    </Button>
  );
}
