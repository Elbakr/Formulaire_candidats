"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  archiveEmployeeAction,
  reactivateEmployeeAction,
  deleteEmployeeAction,
} from "../actions-admin";

export function DangerZone({
  employeeId,
  fullName,
  status,
  isAdmin,
}: {
  employeeId: string;
  fullName: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const isArchived = status === "archived";

  function archive() {
    startTransition(async () => {
      const r = await archiveEmployeeAction(employeeId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Employé archivé. Affectations site clôturées.");
        setArchiveOpen(false);
        router.refresh();
      }
    });
  }

  function reactivate() {
    startTransition(async () => {
      const r = await reactivateEmployeeAction(employeeId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Employé réactivé.");
        router.refresh();
      }
    });
  }

  function hardDelete() {
    startTransition(async () => {
      const r = await deleteEmployeeAction(employeeId, confirmName);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Employé supprimé définitivement.");
        setDeleteOpen(false);
        router.push("/planning/employees");
      }
    });
  }

  return (
    <Card className="border-danger/30">
      <div className="p-4 border-b border-line bg-danger-light/20">
        <h2 className="font-bold text-danger flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Zone sensible
        </h2>
        <p className="text-xs text-ink-3 mt-0.5">
          {isArchived
            ? "Employé archivé. Tu peux le réactiver ou le supprimer définitivement."
            : "Archiver garde l'historique (recommandé). Supprimer efface tout (admin uniquement)."}
        </p>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {isArchived ? (
          <Button variant="outline" onClick={reactivate} disabled={pending}>
            <RotateCcw className="h-3.5 w-3.5" /> Réactiver
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={pending}
          >
            <Archive className="h-3.5 w-3.5" /> Archiver
          </Button>
        )}
        {isAdmin ? (
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            disabled={pending}
            className="border-danger text-danger hover:bg-danger-light"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer définitivement
          </Button>
        ) : null}
      </div>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archiver {fullName} ?</DialogTitle>
            <DialogDescription>
              L'employé sera marqué comme archivé. Il disparaît du planning, du
              chat (groupes site) et des listes actives, mais l'historique
              (shifts, pointages, scoring) est conservé. Tu peux le réactiver à
              tout moment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button onClick={archive} disabled={pending}>
              {pending ? "…" : "Archiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger">
              Supprimer définitivement {fullName} ?
            </DialogTitle>
            <DialogDescription>
              Cette action est <strong>irréversible</strong>. Tous les
              shifts, pointages, scoring, documents, affectations site et
              messages chat liés seront supprimés en cascade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-name">
              Tape <strong>{fullName}</strong> pour confirmer
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={fullName}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setConfirmName("");
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              onClick={hardDelete}
              disabled={
                pending ||
                confirmName.trim().toLowerCase() !==
                  fullName.trim().toLowerCase()
              }
              className="bg-danger text-white hover:bg-danger/90"
            >
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
