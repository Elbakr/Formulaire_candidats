"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
  addSiteNeedAction,
  deleteSiteNeedAction,
  updateSiteNeedAction,
} from "./needs-actions";

type Need = {
  id: string;
  site_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  headcount: number;
  role: string | null;
  is_friday_morning: boolean;
  is_friday_afternoon: boolean;
};

// L'UI affiche Lun..Dim ; nos colonnes contiennent l'index `dow` (0=Dim..6=Sam)
const UI_DAYS: Array<{ dow: number; long: string; short: string }> = [
  { dow: 1, long: "Lundi", short: "Lun" },
  { dow: 2, long: "Mardi", short: "Mar" },
  { dow: 3, long: "Mercredi", short: "Mer" },
  { dow: 4, long: "Jeudi", short: "Jeu" },
  { dow: 5, long: "Vendredi", short: "Ven" },
  { dow: 6, long: "Samedi", short: "Sam" },
  { dow: 0, long: "Dimanche", short: "Dim" },
];

type EditorState =
  | { mode: "create"; dow: number }
  | { mode: "edit"; need: Need };

export function NeedsEditor({
  siteId,
  needs,
}: {
  siteId: string;
  needs: Need[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pending, startTransition] = useTransition();

  const needsByDow = new Map<number, Need[]>();
  for (const n of needs) {
    const arr = needsByDow.get(n.day_of_week) ?? [];
    arr.push(n);
    needsByDow.set(n.day_of_week, arr);
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce créneau ?")) return;
    startTransition(async () => {
      const r = await deleteSiteNeedAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Créneau supprimé.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold">Besoins hebdomadaires</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Définit les créneaux récurrents requis (effectif × poste) pour chaque jour.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 p-3">
        {UI_DAYS.map(({ dow, long, short }) => {
          const list = needsByDow.get(dow) ?? [];
          return (
            <div key={dow} className="rounded-md border border-line bg-canvas overflow-hidden flex flex-col">
              <div className="px-2 py-1.5 sticky top-0 bg-surface-2 border-b border-line z-[1]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">{short}</div>
                <div className="text-xs font-bold text-ink">{long}</div>
              </div>
              <div className="p-2 space-y-1.5 flex-1">
                {list.length === 0 ? (
                  <div className="text-[11px] italic text-ink-3 px-1 py-2">Aucun créneau.</div>
                ) : (
                  list.map((n) => (
                    <div
                      key={n.id}
                      className="rounded border border-line p-1.5 bg-surface text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-mono font-bold">
                          {n.start_time.slice(0, 5)}–{n.end_time.slice(0, 5)}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEditor({ mode: "edit", need: n })}
                            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-surface-2 text-ink-2 hover:text-gold-dark transition-colors"
                            aria-label="Modifier"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleDelete(n.id)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-danger-light text-ink-2 hover:text-danger transition-colors"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-ink-3">
                        {n.headcount} × {n.role ?? "—"}
                      </div>
                      {dow === 5 && (n.is_friday_morning || n.is_friday_afternoon) ? (
                        <div className="text-[9px] uppercase tracking-wider text-gold-dark font-bold">
                          {n.is_friday_morning ? "Matin Ven" : null}
                          {n.is_friday_morning && n.is_friday_afternoon ? " · " : null}
                          {n.is_friday_afternoon ? "Aprem Ven" : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => setEditor({ mode: "create", dow })}
                  className="w-full mt-1 text-[10px] text-ink-3 hover:text-gold-dark py-2 min-h-[40px] rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Ajouter
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editor ? (
        <NeedDialog
          state={editor}
          siteId={siteId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function NeedDialog({
  state,
  siteId,
  onClose,
  onSaved,
}: {
  state: EditorState;
  siteId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = state.mode === "edit";
  const initialDow = state.mode === "edit" ? state.need.day_of_week : state.dow;
  const [dow, setDow] = useState<number>(initialDow);
  const initial = state.mode === "edit" ? state.need : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le besoin" : "Nouveau besoin"}</DialogTitle>
          <DialogDescription>
            {UI_DAYS.find((d) => d.dow === dow)?.long ?? ""}
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            const start = String(fd.get("start_time") ?? "").trim();
            const end = String(fd.get("end_time") ?? "").trim();
            const headcount = Number(fd.get("headcount") ?? 1);
            const role = String(fd.get("role") ?? "").trim() || null;
            const is_friday_morning = fd.get("is_friday_morning") === "on";
            const is_friday_afternoon = fd.get("is_friday_afternoon") === "on";
            startTransition(async () => {
              const r = isEdit
                ? await updateSiteNeedAction({
                    id: state.need.id,
                    siteId,
                    day_of_week: dow,
                    start_time: start,
                    end_time: end,
                    headcount,
                    role,
                    is_friday_morning,
                    is_friday_afternoon,
                  })
                : await addSiteNeedAction({
                    siteId,
                    day_of_week: dow,
                    start_time: start,
                    end_time: end,
                    headcount,
                    role,
                    is_friday_morning,
                    is_friday_afternoon,
                  });
              if (r?.error) toast.error(r.error);
              else {
                toast.success(isEdit ? "Besoin mis à jour." : "Besoin créé.");
                onSaved();
              }
            });
          }}
          className="space-y-3 px-5 py-3"
        >
          <div>
            <Label htmlFor="day_of_week">Jour</Label>
            <select
              id="day_of_week"
              value={dow}
              onChange={(e) => setDow(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
            >
              {UI_DAYS.map((d) => (
                <option key={d.dow} value={d.dow}>
                  {d.long}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start_time">Début</Label>
              <Input
                id="start_time"
                name="start_time"
                type="time"
                defaultValue={initial?.start_time?.slice(0, 5) ?? "10:00"}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_time">Fin</Label>
              <Input
                id="end_time"
                name="end_time"
                type="time"
                defaultValue={initial?.end_time?.slice(0, 5) ?? "18:00"}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="headcount">Effectif</Label>
              <Input
                id="headcount"
                name="headcount"
                type="number"
                min={1}
                max={20}
                defaultValue={initial?.headcount ?? 1}
                required
              />
            </div>
            <div>
              <Label htmlFor="role">Poste</Label>
              <Input
                id="role"
                name="role"
                type="text"
                defaultValue={initial?.role ?? "Vendeur(se)"}
                placeholder="Vendeur(se)"
              />
            </div>
          </div>
          {dow === 5 ? (
            <div className="rounded-md bg-surface-2 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">Vendredi</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="is_friday_morning"
                  defaultChecked={initial?.is_friday_morning ?? false}
                  className="h-4 w-4 rounded border-line"
                />
                <span>Créneau matin (avant 14h)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  name="is_friday_afternoon"
                  defaultChecked={initial?.is_friday_afternoon ?? false}
                  className="h-4 w-4 rounded border-line"
                />
                <span>Créneau après-midi (après 14h)</span>
              </label>
            </div>
          ) : null}
          <DialogFooter className="-mx-5 -mb-3 mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
