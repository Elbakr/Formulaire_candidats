"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plane, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { markEmployeeOnLeaveAction } from "./leave-actions";

type LeaveKind = "vacation" | "sick" | "personal" | "unpaid" | "other";

const KIND_LABELS: Record<LeaveKind, string> = {
  vacation: "Congé payé",
  sick: "Maladie",
  personal: "Personnel",
  unpaid: "Sans solde",
  other: "Autre",
};

export function LeaveButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [kind, setKind] = useState<LeaveKind>("sick");
  const [reason, setReason] = useState("");
  const [deleteShifts, setDeleteShifts] = useState(true);

  function submit() {
    startTransition(async () => {
      const r = await markEmployeeOnLeaveAction({
        employeeId,
        startDate,
        endDate: endDate || null,
        kind,
        reason: reason.trim() || null,
        deleteShiftsInRange: deleteShifts,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const open = r.openEnded ? " (sans fin programmée)" : "";
      const removed = (r.removedShifts ?? 0) > 0
        ? ` · ${r.removedShifts} shift(s) supprimé(s)`
        : "";
      toast.success(`${employeeName} en congé${open}${removed}`, { duration: 6000 });
      setOpen(false);
      // Reset
      setEndDate("");
      setReason("");
      setKind("sick");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Déclarer cet employé en congé">
          <Plane className="h-3.5 w-3.5" />
          Mettre en congé
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déclarer un congé pour {employeeName}</DialogTitle>
          <DialogDescription>
            Pour un congé non programmé (maladie, urgence). Si tu ne connais pas
            la date de fin, laisse vide — le congé restera ouvert jusqu'à ce que
            tu le clôtures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
              Type
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as LeaveKind)}
              className="w-full h-10 rounded-md border border-line bg-surface px-2 text-sm"
            >
              {(Object.keys(KIND_LABELS) as LeaveKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Début
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 rounded-md border border-line bg-surface px-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Fin <span className="text-ink-3 font-normal">(facultative)</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="sans fin"
                className="w-full h-10 rounded-md border border-line bg-surface px-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
              Motif <span className="text-ink-3 font-normal">(optionnel)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: arrêt maladie, urgence familiale…"
              className="w-full h-10 rounded-md border border-line bg-surface px-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded bg-warn-light/40">
            <input
              type="checkbox"
              checked={deleteShifts}
              onChange={(e) => setDeleteShifts(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Supprimer les shifts</strong> de cet employé pendant la
              période. Si tu laisses coché, les créneaux planifiés seront
              annulés (utile pour libérer les besoins du site).
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !startDate}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Valider le congé
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
