"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { upsertShiftAction, deleteShiftAction } from "../actions";
import { toast } from "sonner";

type Shift = {
  id: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  site_id?: string | null;
  notes: string | null;
};

type SiteOption = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

export function ShiftDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  shift,
  defaults,
  sites = [],
  preferredSiteIds = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string;
  /** Shift existant — mode édition. */
  shift?: Shift;
  /** Valeurs par défaut pour la création (pré-remplies par un besoin). */
  defaults?: Partial<Shift>;
  /** Tous les sites actifs */
  sites?: SiteOption[];
  /** IDs des sites où l'employé est assigné (mis en tête de la liste) */
  preferredSiteIds?: string[];
}) {
  const [pending, startTransition] = useTransition();
  const initial = shift ?? defaults;
  const [siteId, setSiteId] = useState<string>(
    shift?.site_id ?? defaults?.site_id ?? (preferredSiteIds[0] ?? "none"),
  );

  // Sites triés : préférés d'abord, puis le reste, alpha.
  const orderedSites = [...sites].sort((a, b) => {
    const aPref = preferredSiteIds.includes(a.id);
    const bPref = preferredSiteIds.includes(b.id);
    if (aPref && !bPref) return -1;
    if (!aPref && bPref) return 1;
    return a.code.localeCompare(b.code);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{shift ? "Modifier le shift" : "Nouveau shift"}</DialogTitle>
          <DialogDescription>
            {employeeName} · {new Date(date).toLocaleDateString("fr-BE", { weekday: "long", day: "2-digit", month: "long" })}
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            fd.set("employee_id", employeeId);
            fd.set("date", date);
            fd.set("site_id", siteId);
            if (shift?.id) fd.set("id", shift.id);
            startTransition(async () => {
              const r = await upsertShiftAction(fd);
              if (r?.error) toast.error(r.error);
              else {
                toast.success(shift ? "Shift mis à jour." : "Shift créé.");
                onOpenChange(false);
              }
            });
          }}
          className="space-y-3 px-5 py-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start_time">Début</Label>
              <Input id="start_time" name="start_time" type="time" defaultValue={initial?.start_time?.slice(0, 5) ?? "09:00"} required />
            </div>
            <div>
              <Label htmlFor="end_time">Fin</Label>
              <Input id="end_time" name="end_time" type="time" defaultValue={initial?.end_time?.slice(0, 5) ?? "17:00"} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="break_minutes">Pause (min)</Label>
              <Input id="break_minutes" name="break_minutes" type="number" min={0} max={240} defaultValue={initial?.break_minutes ?? 30} />
            </div>
            <div>
              <Label htmlFor="position">Poste</Label>
              <Input id="position" name="position" defaultValue={initial?.position ?? ""} placeholder="Caisse, atelier…" />
            </div>
          </div>
          {orderedSites.length > 0 ? (
            <div>
              <Label htmlFor="site_id">Site</Label>
              <select
                id="site_id"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
              >
                <option value="none">— Aucun site —</option>
                {orderedSites.map((s) => {
                  const isPreferred = preferredSiteIds.includes(s.id);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                      {isPreferred ? " (assigné)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="location">Lieu (texte libre, optionnel)</Label>
            <Input id="location" name="location" defaultValue={initial?.location ?? ""} placeholder="Ex. salle de formation" />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
          </div>
          <DialogFooter className="-mx-5 -mb-3 mt-4">
            {shift?.id ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (!confirm("Supprimer ce shift ?")) return;
                  startTransition(async () => {
                    const r = await deleteShiftAction(shift.id);
                    if (r?.error) toast.error(r.error);
                    else {
                      toast.success("Shift supprimé.");
                      onOpenChange(false);
                    }
                  });
                }}
                disabled={pending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : shift ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
