"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertTriangle, Check, Loader2 } from "lucide-react";
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
import {
  generateEmployeeWeekPlanAction,
  commitEmployeeWeekPlanAction,
  type EmpPlanPreview,
} from "../generate-actions";

const FR_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function GenerateEmployeePlanButton({
  employeeId,
  weekISO,
}: {
  employeeId: string;
  weekISO: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmpPlanPreview | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpen() {
    setOpen(true);
    setPreview(null);
    startTransition(async () => {
      const r = await generateEmployeeWeekPlanAction({ employeeId, weekISO });
      if (r.error) {
        toast.error(r.error);
        setOpen(false);
      } else if (r.preview) {
        setPreview(r.preview);
      }
    });
  }

  function onApply() {
    if (!preview) return;
    const nothingToDo =
      preview.drafts.length === 0 &&
      (preview.reclassifications?.length ?? 0) === 0 &&
      (preview.ot_proposals?.length ?? 0) === 0;
    if (nothingToDo) return;
    startTransition(async () => {
      const r = await commitEmployeeWeekPlanAction({
        employeeId,
        drafts: preview.drafts,
        reclassifyShiftIds: (preview.reclassifications ?? []).map((x) => x.shift_id),
        otProposals: preview.ot_proposals ?? [],
      });
      if (r.error) {
        toast.error(r.error);
      } else {
        const parts: string[] = [];
        if (r.reclassified && r.reclassified > 0) {
          parts.push(`${r.reclassified} OT reclassé(s) en contractuel`);
        }
        if (r.created && r.created > 0) {
          parts.push(`${r.created} shift(s) créé(s)`);
        }
        if (r.ot_created && r.ot_created > 0) {
          parts.push(`${r.ot_created} heure(s) sup créée(s)`);
        }
        toast.success(parts.join(" • ") || "Planning mis a jour.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="gold" size="sm" onClick={onOpen}>
        <Sparkles className="h-3.5 w-3.5 mr-1" />
        Générer la semaine
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold-dark" />
              Générer le planning de la semaine
            </DialogTitle>
            <DialogDescription>
              Distribue le quota contractuel restant sur les jours disponibles.
              Respecte OFF, congés, indispos, fermetures et shifts déjà présents.
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="py-6 text-center text-sm text-ink-3 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calcul du planning...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-line p-2">
                  <div className="text-[10px] uppercase text-ink-3">Cible / sem</div>
                  <div className="font-mono font-bold">{preview.weekly_target}h</div>
                </div>
                <div className="rounded border border-line p-2">
                  <div className="text-[10px] uppercase text-ink-3">Déjà planifié</div>
                  <div className="font-mono font-bold">
                    {preview.already_contractual_hours.toFixed(1)}h
                  </div>
                </div>
                <div className="rounded border border-line p-2">
                  <div className="text-[10px] uppercase text-ink-3">À ajouter</div>
                  <div className="font-mono font-bold text-success">
                    {preview.total_drafts_hours.toFixed(1)}h
                  </div>
                </div>
              </div>

              {preview.warnings.length > 0 ? (
                <div className="rounded-md border border-warn bg-warn-light/40 p-2 text-xs space-y-1">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 text-warn shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {(preview.reclassifications?.length ?? 0) > 0 ? (
                <div className="rounded-md border border-orange-300 bg-orange-50 p-2 text-xs">
                  <div className="font-bold text-orange-800 mb-1">
                    {preview.reclassifications.length} shift(s) OT a reclasser en contractuel (+{preview.total_reclassified_hours.toFixed(1)}h)
                  </div>
                  <ul className="space-y-0.5">
                    {preview.reclassifications.map((r) => {
                      const dt = new Date(r.date + "T00:00:00");
                      return (
                        <li key={r.shift_id} className="flex items-center gap-2 text-orange-900">
                          <span className="font-mono w-20 text-orange-700/80">
                            {FR_DAYS[dt.getDay()]} {String(dt.getDate()).padStart(2, "0")}/{String(dt.getMonth() + 1).padStart(2, "0")}
                          </span>
                          <span className="font-mono">{r.start_time} – {r.end_time}</span>
                          <span className="ml-auto">{r.hours.toFixed(1)}h</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {preview.drafts.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase text-ink-3 font-bold tracking-wider mb-1">
                    Nouveaux shifts contractuels
                  </div>
                  <ul className="text-xs divide-y divide-line border border-line rounded-md max-h-48 overflow-auto">
                    {preview.drafts.map((d, i) => {
                      const dt = new Date(d.date + "T00:00:00");
                      return (
                        <li key={i} className="p-2 flex items-center gap-2">
                          <span className="font-mono w-20 text-ink-3">
                            {FR_DAYS[dt.getDay()]} {String(dt.getDate()).padStart(2, "0")}/{String(dt.getMonth() + 1).padStart(2, "0")}
                          </span>
                          <span className="font-mono font-bold">
                            {d.start_time.slice(0, 5)} – {d.end_time.slice(0, 5)}
                          </span>
                          <span className="text-ink-3 ml-auto">{d.hours.toFixed(1)}h</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {(preview.ot_proposals?.length ?? 0) > 0 ? (
                <div>
                  <div className="text-[10px] uppercase text-orange-700 font-bold tracking-wider mb-1 flex items-center gap-1">
                    Heures sup proposées (×1.5) pour combler {preview.ot_proposals.length} créneau{preview.ot_proposals.length > 1 ? "x" : ""} non couvert
                    {preview.ot_proposals.length > 1 ? "s" : ""} (+{preview.total_ot_proposed_hours.toFixed(1)}h)
                  </div>
                  <ul className="text-xs divide-y divide-orange-200 border border-orange-300 bg-orange-50 rounded-md max-h-48 overflow-auto">
                    {preview.ot_proposals.map((p, i) => {
                      const dt = new Date(p.date + "T00:00:00");
                      return (
                        <li key={i} className="p-2 flex items-center gap-2 text-orange-900">
                          <span className="font-mono w-20 text-orange-700/80">
                            {FR_DAYS[dt.getDay()]} {String(dt.getDate()).padStart(2, "0")}/{String(dt.getMonth() + 1).padStart(2, "0")}
                          </span>
                          <span className="font-mono font-bold">
                            {p.start_time} – {p.end_time}
                          </span>
                          <span className="text-[10px] italic ml-auto">{p.reason}</span>
                          <span className="text-orange-700 font-bold">{p.hours.toFixed(1)}h</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {preview.drafts.length === 0 &&
              (preview.reclassifications?.length ?? 0) === 0 &&
              (preview.ot_proposals?.length ?? 0) === 0 ? (
                <div className="text-xs text-ink-3 italic text-center py-4">
                  Rien à proposer. Voir warnings ci-dessus.
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              variant="gold"
              onClick={onApply}
              disabled={
                pending ||
                !preview ||
                (preview.drafts.length === 0 &&
                  (preview.reclassifications?.length ?? 0) === 0 &&
                  (preview.ot_proposals?.length ?? 0) === 0)
              }
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              {(() => {
                const r = preview?.reclassifications?.length ?? 0;
                const c = preview?.drafts.length ?? 0;
                const o = preview?.ot_proposals?.length ?? 0;
                const parts: string[] = [];
                if (r > 0) parts.push(`${r} reclassement${r > 1 ? "s" : ""}`);
                if (c > 0) parts.push(`${c} shift${c > 1 ? "s" : ""}`);
                if (o > 0) parts.push(`${o} OT`);
                return parts.length > 0 ? `Valider : ${parts.join(" + ")}` : "Valider";
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
