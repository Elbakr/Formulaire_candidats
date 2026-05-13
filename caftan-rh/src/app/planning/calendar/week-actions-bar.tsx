"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GenerateWeekDialog } from "./generate-week-dialog";
import { rollbackRecentDraftsAction } from "@/app/planning/auto-drafts/actions";

type SiteOption = { id: string; code: string; name: string; color: string | null };

export function WeekActionsBar({
  sites,
  mondayISO,
  hasRollbackAvailable,
  rollbackTargetWeek,
}: {
  sites: SiteOption[];
  mondayISO: string;
  hasRollbackAvailable: boolean;
  rollbackTargetWeek?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onRollback() {
    const week = rollbackTargetWeek ?? mondayISO;
    if (!confirm(`Annuler la dernière génération de planning (semaine du ${week}) ? Cela supprime les shifts créés.`)) return;
    startTransition(async () => {
      const r = await rollbackRecentDraftsAction(week);
      if (r.error) {
        toast.error(r.error);
      } else {
        toast.success(`${r.rolled_back ?? 0} drafts annulés · ${r.removed ?? 0} shifts supprimés.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="gold" onClick={() => setOpen(true)} title="Génère le planning pour plusieurs sites et plusieurs semaines en 1 clic. Choix mémorisés.">
        <Sparkles className="h-4 w-4 mr-1" />
        Générer le planning · multi-sites
      </Button>
      {hasRollbackAvailable ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRollback}
          disabled={pending}
          title="Supprime les shifts créés par la dernière génération (24h max)"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
          )}
          Annuler la dernière génération
        </Button>
      ) : null}
      <GenerateWeekDialog
        open={open}
        onOpenChange={setOpen}
        sites={sites}
        mondayISO={mondayISO}
      />
    </div>
  );
}
