"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
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
import {
  upsertShiftAction,
  deleteShiftAction,
  getEmployeeWeeklyHoursAction,
} from "../actions";
import { shiftHours } from "@/lib/planning";
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
  is_overtime?: boolean | null;
  overtime_multiplier?: number | null;
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

  // États contrôlés pour calculer la projection heures en live.
  const [startTime, setStartTime] = useState<string>(
    initial?.start_time?.slice(0, 5) ?? "09:00",
  );
  const [endTime, setEndTime] = useState<string>(
    initial?.end_time?.slice(0, 5) ?? "17:00",
  );
  const [breakMinutes, setBreakMinutes] = useState<number>(
    initial?.break_minutes ?? 30,
  );
  const [isOvertime, setIsOvertime] = useState<boolean>(
    shift?.is_overtime === true || defaults?.is_overtime === true,
  );
  const [overtimeMultiplier, setOvertimeMultiplier] = useState<string>(
    String(shift?.overtime_multiplier ?? defaults?.overtime_multiplier ?? 1.5),
  );

  // Quota hebdo chargé au mount via action serveur.
  const [weekly, setWeekly] = useState<{
    weeklyTarget: number;
    contractualHoursThisWeek: number;
    overtimeHoursThisWeek: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await getEmployeeWeeklyHoursAction(
        employeeId,
        date,
        shift?.id ?? null,
      );
      if (!cancelled) {
        setWeekly({
          weeklyTarget: r.weeklyTarget,
          contractualHoursThisWeek: r.contractualHoursThisWeek,
          overtimeHoursThisWeek: r.overtimeHoursThisWeek,
        });
      }
    })().catch(() => {
      /* silencieux : si l'action plante, on ne montre juste pas le banner */
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, date, shift?.id]);

  // Sites triés : préférés d'abord, puis le reste, alpha.
  const orderedSites = [...sites].sort((a, b) => {
    const aPref = preferredSiteIds.includes(a.id);
    const bPref = preferredSiteIds.includes(b.id);
    if (aPref && !bPref) return -1;
    if (!aPref && bPref) return 1;
    return a.code.localeCompare(b.code);
  });

  // Calcul projection contractuelle (n'inclut ce shift que si is_overtime=false)
  const projection = useMemo(() => {
    if (!weekly) return null;
    const thisH =
      startTime && endTime && endTime > startTime
        ? shiftHours(startTime, endTime, breakMinutes)
        : 0;
    const addToContract = isOvertime ? 0 : thisH;
    const projected = weekly.contractualHoursThisWeek + addToContract;
    const over = projected - weekly.weeklyTarget;
    return {
      thisH,
      projected,
      over,
      isOver: over > 0.01,
      weeklyTarget: weekly.weeklyTarget,
    };
  }, [weekly, startTime, endTime, breakMinutes, isOvertime]);

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
            // Les valeurs contrôlées doivent être resync (l'attribut name est
            // sur les <Input>, on s'assure que la FormData reflète bien l'état).
            fd.set("start_time", startTime);
            fd.set("end_time", endTime);
            fd.set("break_minutes", String(breakMinutes));
            if (isOvertime) {
              fd.set("is_overtime", "on");
              fd.set("overtime_multiplier", overtimeMultiplier);
            } else {
              fd.delete("is_overtime");
              fd.delete("overtime_multiplier");
            }
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
              <Input
                id="start_time"
                name="start_time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_time">Fin</Label>
              <Input
                id="end_time"
                name="end_time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="break_minutes">Pause (min)</Label>
              <Input
                id="break_minutes"
                name="break_minutes"
                type="number"
                min={0}
                max={240}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="position">Poste</Label>
              <Input
                id="position"
                name="position"
                defaultValue={initial?.position ?? ""}
                placeholder="Caisse, atelier…"
              />
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

          {/* Banner dépassement contractuel + toggle OT */}
          {projection?.isOver && !isOvertime ? (
            <div
              className="rounded-md border border-warn bg-warn-light/50 p-3 text-xs space-y-2"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-ink">
                    Cet ajout porte {weekly?.contractualHoursThisWeek.toFixed(1)}h à{" "}
                    {projection.projected.toFixed(1)}h sur la semaine
                  </div>
                  <div className="text-ink-2">
                    Cible : {projection.weeklyTarget}h ·{" "}
                    <span className="font-bold text-warn">
                      dépassement de +{projection.over.toFixed(1)}h
                    </span>
                    .
                  </div>
                  <div className="mt-1 text-ink-2">
                    Veux-tu marquer ce shift en{" "}
                    <button
                      type="button"
                      onClick={() => setIsOvertime(true)}
                      className="font-bold underline text-gold-dark"
                    >
                      heures supplémentaires
                    </button>{" "}
                    ?
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Compteur info passif quand on est dans les clous */}
          {projection && !projection.isOver && !isOvertime && weekly ? (
            <div className="text-[11px] text-ink-3">
              Cette semaine : {(weekly.contractualHoursThisWeek + projection.thisH).toFixed(1)}h /{" "}
              {projection.weeklyTarget}h contractuels
              {weekly.overtimeHoursThisWeek > 0
                ? ` (+ ${weekly.overtimeHoursThisWeek.toFixed(1)}h OT)`
                : ""}
              .
            </div>
          ) : null}

          {/* Bloc heures sup */}
          <div className="rounded-md border border-line p-2.5 space-y-2 bg-surface-2/40">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="cursor-pointer"
              />
              <span className="font-bold">Marquer en heures sup</span>
              <span className="text-[11px] text-ink-3">
                (au-delà du contrat hebdo)
              </span>
            </label>
            {isOvertime ? (
              <div className="flex items-center gap-2 pl-6 text-xs">
                <Label htmlFor="overtime_multiplier" className="m-0">
                  Multiplicateur
                </Label>
                <select
                  id="overtime_multiplier"
                  value={overtimeMultiplier}
                  onChange={(e) => setOvertimeMultiplier(e.target.value)}
                  className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
                >
                  <option value="1.25">×1.25</option>
                  <option value="1.5">×1.5</option>
                  <option value="2.0">×2.0</option>
                </select>
              </div>
            ) : null}
          </div>

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
