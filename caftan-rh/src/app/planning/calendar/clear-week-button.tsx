"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser } from "lucide-react";
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
import { addDays, parseISODate } from "@/lib/planning";
import { clearWeekAction, countWeekShiftsAction, restoreDeletedShiftsAction } from "./bulk-actions";
import { useShiftUndo } from "@/components/shift-undo-provider";

/**
 * Bouton "Vider la semaine" en 1 clic — ouvre un Dialog avec confirmation
 * simple (pas de retape de mot-clé). Si la semaine est déjà vide, le bouton
 * est désactivé avec un tooltip "Semaine déjà vide".
 *
 * `siteId` optionnel : si fourni, ne vide que les shifts du site (utile sur
 * la page d'un site où on ne veut pas toucher aux autres magasins).
 */
export function ClearWeekButton({
  weekISO,
  siteId,
  employeeId,
  className,
  scopeLabel,
}: {
  weekISO: string;
  siteId?: string | null;
  /** Karim 15/05 : scope par employe quand utilise sur la fiche /planning/employees/[id]/calendar */
  employeeId?: string | null;
  className?: string;
  /** Mention textuelle ajoutee dans le dialog : "sur ce site" / "pour cet employe" / "" */
  scopeLabel?: string;
}) {
  const router = useRouter();
  const undoCtx = useShiftUndo();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Charge le compteur au montage et quand weekISO/siteId changent — pour
  // pouvoir désactiver le bouton quand la semaine est déjà vide.
  useEffect(() => {
    let cancelled = false;
    setLoadingCount(true);
    countWeekShiftsAction({
      weekISO,
      siteId: siteId ?? null,
      employeeId: employeeId ?? null,
    }).then((r) => {
      if (cancelled) return;
      setLoadingCount(false);
      if ("count" in r && typeof r.count === "number") setCount(r.count);
    });
    return () => {
      cancelled = true;
    };
  }, [weekISO, siteId, employeeId]);

  const monday = parseISODate(weekISO);
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" });
  const range = `du ${fmt(monday)} au ${fmt(sunday)}`;
  const isEmpty = count === 0;

  function clear() {
    startTransition(async () => {
      const r = await clearWeekAction({
        weekISO,
        siteId: siteId ?? null,
        employeeId: employeeId ?? null,
      });
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      const snaps = r?.snapshots ?? [];
      const deleted = r?.deleted ?? 0;
      // Karim 15/05 : push undo Ctrl+Z pour restaurer les shifts supprimes.
      // Si > 200 shifts, snapshots sera vide (limite serveur) et on ne pourra
      // pas restaurer -- on log alors un toast informatif sans push.
      if (snaps.length > 0) {
        undoCtx.push({
          label: `${deleted} shift(s) supprimé(s)`,
          undo: async () => {
            const rr = await restoreDeletedShiftsAction(snaps);
            if (rr.error) throw new Error(rr.error);
            router.refresh();
          },
        });
      } else {
        toast.success(
          deleted > 200
            ? `${deleted} shifts supprimés (trop nombreux pour Ctrl+Z).`
            : `${deleted} shifts supprimés.`,
        );
      }
      setOpen(false);
      setCount(0);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={loadingCount || isEmpty}
        title={isEmpty ? "Semaine déjà vide" : "Vider la semaine"}
        onClick={() => setOpen(true)}
        className={className}
      >
        <Eraser className="h-3.5 w-3.5" /> Vider la semaine
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vider la semaine</DialogTitle>
            <DialogDescription>
              {`Vider tous les shifts de la semaine ${range}${scopeLabel ? ` ${scopeLabel}` : siteId ? " sur ce site" : employeeId ? " pour cet employé" : ""} ? Cette action est irréversible.`}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3 text-sm text-ink-2">
            {count !== null
              ? `${count} shift${count > 1 ? "s" : ""} ser${count > 1 ? "ont" : "a"} supprimé${count > 1 ? "s" : ""}.`
              : "Chargement du compteur…"}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button variant="danger" disabled={pending || isEmpty} onClick={clear}>
              <Eraser className="h-3.5 w-3.5" /> Vider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
