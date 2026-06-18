"use client";

// Karim 2026-05-25 : Editeur compact des pointages d un jour donne.
// Permet : modifier kind/heure, supprimer, ajouter un pointage manuel.
// Reserve admin/rh (verif cote action).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  editClockEntryAction,
  deleteClockEntryAction,
  addClockEntryAction,
} from "./actions";

type Entry = {
  id: string;
  kind: "in" | "out";
  occurred_at: string;
  source: string | null;
};

export function ClockEditor({
  employeeId,
  day,
  entries,
  canEdit,
}: {
  employeeId: string;
  day: string; // YYYY-MM-DD
  entries: Entry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState<Entry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    // Affichage read-only des entries pour les non-admin
    if (entries.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {entries.map((e) => (
          <span key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${e.kind === "in" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {e.kind.toUpperCase()} {fmtTime(e.occurred_at)}
          </span>
        ))}
      </div>
    );
  }

  function handleEdit(entry: Entry, newKind: "in" | "out", newTime: string) {
    if (!/^\d{2}:\d{2}$/.test(newTime)) {
      toast.error("Heure invalide");
      return;
    }
    const base = new Date(entry.occurred_at);
    const [h, m] = newTime.split(":").map(Number);
    base.setHours(h, m, 0, 0);
    const iso = base.toISOString();
    startTransition(async () => {
      const res = await editClockEntryAction(entry.id, newKind, iso);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Pointage modifié.");
      setEditOpen(null);
      router.refresh();
    });
  }

  function handleDelete(entryId: string) {
    if (!confirm("Supprimer ce pointage ?")) return;
    startTransition(async () => {
      const res = await deleteClockEntryAction(entryId);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Pointage supprimé.");
      router.refresh();
    });
  }

  function handleAdd(kind: "in" | "out", time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Heure invalide");
      return;
    }
    const iso = new Date(`${day}T${time}:00`).toISOString();
    startTransition(async () => {
      const res = await addClockEntryAction({ employeeId, kind, occurredAt: iso });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Pointage ajouté.");
      setAddOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {entries.map((e) => (
          <div key={e.id} className="inline-flex items-center gap-0.5 group">
            <button
              type="button"
              onClick={() => setEditOpen(e)}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono hover:ring-1 hover:ring-gold transition ${
                e.kind === "in" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
              title="Modifier ce pointage"
            >
              {e.kind.toUpperCase()} {fmtTime(e.occurred_at)}
              <Pencil className="inline h-2.5 w-2.5 ml-0.5 opacity-50" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(e.id)}
              className="opacity-0 group-hover:opacity-100 text-[10px] p-0.5 rounded text-rose-700 hover:bg-rose-50 transition"
              title="Supprimer"
              disabled={pending}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-line text-ink-3 hover:bg-surface-2 hover:text-ink-1"
          title="Ajouter un pointage manuel"
        >
          <Plus className="inline h-2.5 w-2.5" /> Ajouter
        </button>
      </div>

      {editOpen ? (
        <EditDialog
          entry={editOpen}
          onClose={() => setEditOpen(null)}
          onSubmit={(kind, time) => handleEdit(editOpen, kind, time)}
          pending={pending}
        />
      ) : null}

      {addOpen ? (
        <AddDialog
          day={day}
          onClose={() => setAddOpen(false)}
          onSubmit={(kind, time) => handleAdd(kind, time)}
          pending={pending}
        />
      ) : null}
    </>
  );
}

/**
 * Karim 2026-06-18 : bouton « Corriger les pointages » présent sur CHAQUE jour
 * (y compris les jours sans shift / sans badge remonté). Déplie l'éditeur de
 * pointages du jour (ajouter / modifier / supprimer). Pour les non-admins, affiche
 * simplement les pointages en lecture seule.
 */
export function DayCorrect({
  employeeId,
  day,
  entries,
  canEdit,
}: {
  employeeId: string;
  day: string;
  entries: Entry[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    return entries.length > 0 ? (
      <ClockEditor employeeId={employeeId} day={day} entries={entries} canEdit={false} />
    ) : null;
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded border border-gold/40 bg-gold-light/30 px-2 py-1 text-[11px] font-semibold text-gold-dark hover:bg-gold-light/60"
        title="Ajouter / modifier / supprimer un pointage de ce jour"
      >
        <Wrench className="h-3 w-3" />
        Corriger les pointages
        {entries.length === 0 ? <span className="text-ink-3 font-normal">(aucun pointage)</span> : null}
      </button>
      {open ? (
        <div className="mt-1.5">
          <ClockEditor employeeId={employeeId} day={day} entries={entries} canEdit />
        </div>
      ) : null}
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function EditDialog({
  entry,
  onClose,
  onSubmit,
  pending,
}: {
  entry: Entry;
  onClose: () => void;
  onSubmit: (kind: "in" | "out", time: string) => void;
  pending: boolean;
}) {
  const [kind, setKind] = useState<"in" | "out">(entry.kind);
  const [time, setTime] = useState(fmtTime(entry.occurred_at));
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Modifier le pointage</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-ink-2 block mb-1">Type</label>
            <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
              <button type="button" onClick={() => setKind("in")} className={`px-3 py-1 text-xs font-bold rounded ${kind === "in" ? "bg-emerald-100 text-emerald-800" : "text-ink-3"}`}>
                IN (entrée)
              </button>
              <button type="button" onClick={() => setKind("out")} className={`px-3 py-1 text-xs font-bold rounded ${kind === "out" ? "bg-amber-100 text-amber-800" : "text-ink-3"}`}>
                OUT (sortie)
              </button>
            </div>
            {kind !== entry.kind ? (
              <p className="text-[10px] text-amber-700 mt-1">⚠ Changement de type (erreur de doigt corrigée)</p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-bold text-ink-2 block mb-1">Heure</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={60} className="w-full px-2 py-1.5 rounded border border-line bg-surface text-sm" />
            <p className="text-[10px] text-ink-3 mt-1">Source actuelle : {entry.source ?? "inconnue"}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button type="button" size="sm" onClick={() => onSubmit(kind, time)} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  day,
  onClose,
  onSubmit,
  pending,
}: {
  day: string;
  onClose: () => void;
  onSubmit: (kind: "in" | "out", time: string) => void;
  pending: boolean;
}) {
  const [kind, setKind] = useState<"in" | "out">("in");
  const [time, setTime] = useState("10:00");
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Ajouter un pointage</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-ink-3">Date : <span className="font-mono">{day}</span></p>
          <div>
            <label className="text-xs font-bold text-ink-2 block mb-1">Type</label>
            <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
              <button type="button" onClick={() => setKind("in")} className={`px-3 py-1 text-xs font-bold rounded ${kind === "in" ? "bg-emerald-100 text-emerald-800" : "text-ink-3"}`}>
                IN (entrée)
              </button>
              <button type="button" onClick={() => setKind("out")} className={`px-3 py-1 text-xs font-bold rounded ${kind === "out" ? "bg-amber-100 text-amber-800" : "text-ink-3"}`}>
                OUT (sortie)
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-ink-2 block mb-1">Heure</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={60} className="w-full px-2 py-1.5 rounded border border-line bg-surface text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button type="button" size="sm" onClick={() => onSubmit(kind, time)} disabled={pending}>
            {pending ? "Ajout…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
