"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  clearShiftsInPeriodAction,
  restoreDeletedShiftsAction,
} from "@/app/planning/calendar/bulk-actions";
import { useShiftUndo } from "@/components/shift-undo-provider";

/**
 * Karim 15/05 : bouton "Reinitialiser sur la periode" pour la page Quotas.
 * Supprime tous les shifts dans [startISO, endISO] pour les sites visibles
 * dans le tableau. Confirmation forte (retape "vider" pour valider), push
 * undo Ctrl+Z (jusqu a 500 shifts).
 */
export function ResetPeriodButton({
  startISO,
  endISO,
  siteIds,
  visibleSitesCount,
}: {
  startISO: string;
  endISO: string;
  siteIds: string[];
  visibleSitesCount: number;
}) {
  const router = useRouter();
  const undoCtx = useShiftUndo();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    if (confirm.trim().toLowerCase() !== "vider") {
      toast.error("Tape 'vider' pour confirmer.");
      return;
    }
    startTransition(async () => {
      const r = await clearShiftsInPeriodAction({
        startISO,
        endISO,
        siteIds: siteIds.length > 0 ? siteIds : null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const snaps = r.snapshots ?? [];
      const deleted = r.deleted ?? 0;
      if (snaps.length > 0) {
        undoCtx.push({
          label: `${deleted} shift(s) supprime(s) sur ${startISO} -> ${endISO}`,
          undo: async () => {
            const rr = await restoreDeletedShiftsAction(snaps);
            if (rr.error) throw new Error(rr.error);
            router.refresh();
          },
        });
      } else {
        toast.success(
          deleted > 500
            ? `${deleted} shifts supprimés (trop nombreux pour Ctrl+Z).`
            : `${deleted} shifts supprimés.`,
        );
      }
      setOpen(false);
      setConfirm("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-danger text-danger hover:bg-danger-light"
      >
        <Eraser className="h-3.5 w-3.5" /> Réinitialiser la période
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
              Réinitialiser tous les shifts ?
            </DialogTitle>
            <DialogDescription>
              Cette action supprime <strong>tous les shifts</strong> entre
              <span className="font-mono"> {startISO}</span> et
              <span className="font-mono"> {endISO}</span> sur
              <strong> {visibleSitesCount} site{visibleSitesCount > 1 ? "s" : ""}</strong> affiché{visibleSitesCount > 1 ? "s" : ""}
              dans le tableau ci-dessous. Tape <span className="font-mono font-bold">vider</span> pour confirmer.
              Tu pourras annuler via Ctrl+Z immédiatement après (max 500 shifts).
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Tape 'vider' pour confirmer"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={reset}
              disabled={pending || confirm.trim().toLowerCase() !== "vider"}
            >
              <Eraser className="h-3.5 w-3.5" /> Réinitialiser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
