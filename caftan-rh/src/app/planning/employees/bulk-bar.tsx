"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bulkArchiveEmployeesAction,
  bulkDeleteEmployeesAction,
} from "./actions-admin";

export function EmployeesBulkBar({
  selected,
  onClear,
  isAdmin,
}: {
  selected: { id: string; full_name: string }[];
  onClear: () => void;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmKw, setConfirmKw] = useState("");

  if (selected.length === 0) return null;

  function archive() {
    startTransition(async () => {
      const r = await bulkArchiveEmployeesAction(selected.map((e) => e.id));
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${r.archived} employé(s) archivé(s).`);
        setArchiveOpen(false);
        onClear();
        router.refresh();
      }
    });
  }

  function hardDelete() {
    startTransition(async () => {
      const r = await bulkDeleteEmployeesAction(selected.map((e) => e.id), confirmKw);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${r.deleted} employé(s) supprimé(s) définitivement.`);
        setDeleteOpen(false);
        setConfirmKw("");
        onClear();
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="sticky bottom-2 z-30 mt-3">
        <div className="bg-ink text-white rounded-lg shadow-lg p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold">
            {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
          </span>
          <span className="text-xs text-white/60 truncate max-w-[300px] hidden sm:inline">
            {selected.slice(0, 3).map((e) => e.full_name).join(", ")}
            {selected.length > 3 ? `, +${selected.length - 3}` : ""}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveOpen(true)}
            disabled={pending}
            className="bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            <Archive className="h-3.5 w-3.5" /> Archiver
          </Button>
          {isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
              className="bg-danger/80 text-white border-danger hover:bg-danger"
            >
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </Button>
          ) : null}
          <button
            onClick={onClear}
            className="text-white/60 hover:text-white p-1"
            aria-label="Désélectionner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archiver {selected.length} employé{selected.length > 1 ? "s" : ""} ?</DialogTitle>
            <DialogDescription>
              Les employés seront marqués comme archivés. L'historique (shifts,
              pointages, scoring) est conservé. Tu peux les réactiver à tout
              moment depuis leur fiche.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-ink-3 max-h-40 overflow-y-auto bg-surface-2 rounded-md p-2 my-2">
            {selected.map((e) => (
              <div key={e.id}>· {e.full_name}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={archive} disabled={pending}>
              {pending ? "…" : `Archiver ${selected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Supprimer {selected.length} employé{selected.length > 1 ? "s" : ""} définitivement ?
            </DialogTitle>
            <DialogDescription>
              Cette action est <strong>irréversible</strong>. Tous les shifts,
              pointages, scoring, documents, affectations site, comptes
              utilisateur Supabase liés seront effacés en cascade.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-danger max-h-40 overflow-y-auto bg-danger-light rounded-md p-2 my-2">
            {selected.map((e) => (
              <div key={e.id}>· {e.full_name}</div>
            ))}
          </div>
          <div className="space-y-1 py-1">
            <Label htmlFor="confirm-kw">
              Tape <strong>SUPPRIMER</strong> pour confirmer
            </Label>
            <Input
              id="confirm-kw"
              value={confirmKw}
              onChange={(e) => setConfirmKw(e.target.value)}
              placeholder="SUPPRIMER"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setConfirmKw("");
              }}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              onClick={hardDelete}
              disabled={pending || confirmKw.trim().toUpperCase() !== "SUPPRIMER"}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {pending ? "…" : `Supprimer ${selected.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
