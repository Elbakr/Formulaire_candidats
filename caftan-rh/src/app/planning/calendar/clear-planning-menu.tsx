"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { clearShiftsByModeAction } from "./bulk-actions";

type Mode = "after_today" | "until_today" | "all";

const MODE_META: Record<Mode, { label: string; description: string; danger: "warn" | "danger" }> = {
  after_today: {
    label: "Après aujourd'hui",
    description: "Vide tous les shifts à partir de demain. Le passé est préservé.",
    danger: "warn",
  },
  until_today: {
    label: "Jusqu'à aujourd'hui (inclus)",
    description: "Vide tous les shifts du passé jusqu'à aujourd'hui inclus. Le futur est préservé.",
    danger: "warn",
  },
  all: {
    label: "Tout (avant + après)",
    description: "Vide TOUS les shifts, sans distinction de date. À utiliser pour repartir de zéro.",
    danger: "danger",
  },
};

/**
 * Karim 18/05 : bouton "Vider tous les planning" reutilisable sur toutes
 * les vues planning. Ouvre un dropdown avec 3 modes, puis dialog de
 * confirmation forte (eviter accidents).
 */
export function ClearPlanningMenu({
  siteId,
  employeeId,
  className,
  size = "sm",
}: {
  /** Limite a un site (page /planning/sites/[code]). */
  siteId?: string | null;
  /** Limite a un employe (page /planning/employees/[id]/calendar). */
  employeeId?: string | null;
  className?: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [confirmMode, setConfirmMode] = useState<Mode | null>(null);
  const [pending, startTransition] = useTransition();

  function execute(mode: Mode) {
    startTransition(async () => {
      const r = await clearShiftsByModeAction({ mode, siteId, employeeId });
      if (r.error) {
        toast.error(`Erreur : ${r.error}`, { duration: 10000 });
        return;
      }
      const n = r.deleted ?? 0;
      if (n === 0) {
        toast.warning(
          "Aucun shift à supprimer (la portée choisie était déjà vide).",
          { duration: 6000 },
        );
      } else {
        toast.success(`${n} shift${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}.`);
      }
      setConfirmMode(null);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} className={className}>
            <Trash2 className="h-3.5 w-3.5" /> Vider planning <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-3">
            Choisir l&apos;étendue
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(["after_today", "until_today", "all"] as Mode[]).map((m) => {
            const meta = MODE_META[m];
            return (
              <DropdownMenuItem
                key={m}
                onClick={() => setConfirmMode(m)}
                className="flex-col items-start gap-0.5 cursor-pointer"
              >
                <span className={`font-bold text-sm ${meta.danger === "danger" ? "text-danger" : ""}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-ink-3 leading-snug">{meta.description}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!confirmMode} onOpenChange={(o) => !o && setConfirmMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${confirmMode === "all" ? "text-danger" : "text-warn"}`} />
              Confirmer le vidage
            </DialogTitle>
            <DialogDescription>
              {confirmMode ? MODE_META[confirmMode].description : ""}
              {siteId ? " Limité au site sélectionné." : null}
              {employeeId ? " Limité à l'employé sélectionné." : null}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-ink-3">
            Cette action est <strong>irréversible</strong> (pas de Ctrl+Z global sur un vidage massif).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmMode(null)} disabled={pending}>
              Annuler
            </Button>
            <Button
              variant={confirmMode === "all" ? "danger" : "outline"}
              onClick={() => confirmMode && execute(confirmMode)}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Vider {confirmMode ? MODE_META[confirmMode].label.toLowerCase() : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
