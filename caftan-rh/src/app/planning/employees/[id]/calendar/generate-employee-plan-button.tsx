"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, AlertTriangle, Check, Loader2, Eraser, ExternalLink } from "lucide-react";
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
import { updateEmployeeBulkAction } from "@/app/planning/employees/bulk-edit/actions";
import { clearWeekAction, restoreDeletedShiftsAction } from "@/app/planning/calendar/bulk-actions";
import { useShiftUndo } from "@/components/shift-undo-provider";

const FR_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

type Period = "this_week" | "next_week" | "rest_of_month";

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(dISO: string): string {
  const d = new Date(dISO + "T00:00:00");
  const dow = d.getDay(); // 0=dim
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return fmtDate(d);
}

/**
 * Calcule la liste des lundis de semaines a generer selon la periode choisie.
 * - this_week : [weekISO]
 * - next_week : [weekISO + 7]
 * - rest_of_month : tous les lundis depuis la semaine de startDate jusqu a
 *   la fin du mois de startDate (incluant la semaine qui chevauche fin du mois).
 */
function computeWeeks(period: Period, weekISO: string, startDate: string): string[] {
  if (period === "this_week") return [weekISO];
  if (period === "next_week") {
    const d = new Date(weekISO + "T00:00:00");
    d.setDate(d.getDate() + 7);
    return [fmtDate(d)];
  }
  // rest_of_month : depuis la semaine de startDate jusqu a fin du mois
  const start = new Date(startDate + "T00:00:00");
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const weeks: string[] = [];
  let cursor = new Date(getMonday(startDate) + "T00:00:00");
  while (cursor <= monthEnd) {
    weeks.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
    if (weeks.length > 6) break; // safety
  }
  return weeks;
}

export function GenerateEmployeePlanButton({
  employeeId,
  weekISO,
}: {
  employeeId: string;
  weekISO: string;
}) {
  const router = useRouter();
  const undoCtx = useShiftUndo();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmpPlanPreview | null>(null);
  const [pending, startTransition] = useTransition();
  // Karim 19/05 : date picker + selecteur periode.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = fmtDate(tomorrow);
  const [startDate, setStartDate] = useState<string>(tomorrowISO);
  const [period, setPeriod] = useState<Period>("this_week");
  // Karim 19/05 : overrides duree/jour, nb jours/semaine, heure de debut.
  const [shiftHoursPerDay, setShiftHoursPerDay] = useState<string>("");
  const [maxDaysPerWeek, setMaxDaysPerWeek] = useState<string>("");
  const [startTimeOverride, setStartTimeOverride] = useState<string>("");
  // Pour multi-weeks : nombre de semaines a traiter + progression
  const [multiProgress, setMultiProgress] = useState<{ done: number; total: number } | null>(null);

  function reloadPreview() {
    const weeks = computeWeeks(period, weekISO, startDate);
    setMultiProgress(weeks.length > 1 ? { done: 0, total: weeks.length } : null);
    startTransition(async () => {
      const shiftH = shiftHoursPerDay ? Number(shiftHoursPerDay) : undefined;
      const maxD = maxDaysPerWeek ? Number(maxDaysPerWeek) : undefined;
      // Karim 19/05 : PARALLELISE les appels par semaine (avant : sequentiel,
      // 4 semaines x ~2s = 8s d attente). Le solver est independant par semaine
      // (chaque semaine a son propre quota hebdo) -> safe a paralleliser.
      const opts = {
        employeeId,
        startDate,
        shiftHoursPerDay: shiftH && Number.isFinite(shiftH) && shiftH > 0 ? shiftH : undefined,
        maxDaysPerWeek: maxD && Number.isFinite(maxD) && maxD > 0 ? maxD : undefined,
        startTimeOverride: /^\d{2}:\d{2}$/.test(startTimeOverride) ? startTimeOverride : undefined,
      } as const;
      let doneCount = 0;
      const promises = weeks.map((w) =>
        generateEmployeeWeekPlanAction({ ...opts, weekISO: w }).then((r) => {
          doneCount++;
          if (weeks.length > 1) setMultiProgress({ done: doneCount, total: weeks.length });
          return { w, r };
        }),
      );
      const settled = await Promise.all(promises);

      // Agrege dans l ordre chronologique (preserve l ordre des semaines)
      let agg: EmpPlanPreview | null = null;
      for (const { w, r } of settled) {
        if (r.error) {
          toast.error(`Semaine du ${w} : ${r.error}`);
          continue;
        }
        if (!r.preview) continue;
        if (!agg) {
          agg = { ...r.preview, drafts: [...r.preview.drafts] };
          agg.reclassifications = [...(agg.reclassifications ?? [])];
          agg.ot_proposals = [...(agg.ot_proposals ?? [])];
          agg.warnings = [...agg.warnings];
        } else {
          agg.drafts.push(...r.preview.drafts);
          agg.reclassifications = [...(agg.reclassifications ?? []), ...(r.preview.reclassifications ?? [])];
          agg.ot_proposals = [...(agg.ot_proposals ?? []), ...(r.preview.ot_proposals ?? [])];
          agg.total_drafts_hours += r.preview.total_drafts_hours;
          agg.total_reclassified_hours += r.preview.total_reclassified_hours;
          agg.total_ot_proposed_hours += r.preview.total_ot_proposed_hours;
          agg.available_days += r.preview.available_days;
          for (const w2 of r.preview.warnings) if (!agg.warnings.includes(w2)) agg.warnings.push(w2);
        }
      }
      if (agg) setPreview(agg);
      else if (weeks.length > 0) toast.error("Aucun preview généré.");
      setMultiProgress(null);
    });
  }

  function onOpen() {
    setOpen(true);
    setPreview(null);
    reloadPreview();
  }

  /** Active OT a niveau 1.5 (multiplier par defaut) sur l employe puis
   *  recharge le preview pour que les OT proposals apparaissent immediatement.
   *  Karim 15/05 : on set ot_max_multiplier (le trigger DB synchronise
   *  ot_eligible). Niveau 1.5 par defaut, modifiable ensuite via le potentiometre
   *  dans /planning/employees/bulk-edit. */
  function activateOTEligibility() {
    startTransition(async () => {
      const r = await updateEmployeeBulkAction(employeeId, { ot_max_multiplier: 1.5 });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Niveau OT défini à ×1.5. Ajuste via Données solver si besoin.");
      reloadPreview();
    });
  }

  /** Vide tous les shifts de la semaine pour CET employe puis recharge le
   *  preview. Karim 15/05 : action rapide quand quota deja sature et qu on
   *  veut tout recommencer. */
  function clearAndReload() {
    if (!confirm("Vider tous les shifts de cet employé pour cette semaine ?")) return;
    startTransition(async () => {
      const r = await clearWeekAction({ weekISO, employeeId });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const snaps = r.snapshots ?? [];
      const deleted = r.deleted ?? 0;
      if (snaps.length > 0) {
        undoCtx.push({
          label: `${deleted} shift(s) supprimé(s). Tu peux régénérer.`,
          undo: async () => {
            const rr = await restoreDeletedShiftsAction(snaps);
            if (rr.error) throw new Error(rr.error);
            router.refresh();
            reloadPreview();
          },
        });
      } else {
        toast.success(`${deleted} shift(s) supprimé(s). Tu peux régénérer.`);
      }
      reloadPreview();
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

          <div className="rounded-md border border-line bg-surface-2 p-3 mb-2 space-y-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                Période à générer
              </label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["this_week", "Cette semaine"],
                  ["next_week", "Semaine prochaine"],
                  ["rest_of_month", "Reste du mois"],
                ] as Array<[Period, string]>).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setPeriod(p); setPreview(null); }}
                    className={`px-2 py-1.5 text-xs font-bold rounded border transition-colors ${
                      period === p
                        ? "bg-gold text-[#1a1a0d] border-gold"
                        : "border-line text-ink-2 hover:bg-surface"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                🗓️ Démarrer à partir de
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreview(null);
                }}
                className="w-full px-2 py-1 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
              />
              <p className="text-[10px] text-ink-3 mt-1">
                Défaut : demain (J+1). Choisis aujourd'hui pour re-planifier après un vidage.
                {period === "rest_of_month" ? " Le 'Reste du mois' part de cette date jusqu'à fin du mois." : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                  ⏱️ Heures / jour
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  step="0.5"
                  value={shiftHoursPerDay}
                  onChange={(e) => { setShiftHoursPerDay(e.target.value); setPreview(null); }}
                  placeholder="auto"
                  className="w-full px-2 py-1 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                  📆 Jours / semaine
                </label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  step="1"
                  value={maxDaysPerWeek}
                  onChange={(e) => { setMaxDaysPerWeek(e.target.value); setPreview(null); }}
                  placeholder="auto"
                  className="w-full px-2 py-1 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                  🕘 Heure début
                </label>
                <input
                  type="time"
                  value={startTimeOverride}
                  onChange={(e) => { setStartTimeOverride(e.target.value); setPreview(null); }}
                  className="w-full px-2 py-1 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-ink-3">Vide = auto (selon contrat employé)</p>
            {preview ? (
              <SuggestedSlot
                preview={preview}
                shiftHoursPerDay={shiftHoursPerDay}
                maxDaysPerWeek={maxDaysPerWeek}
                startTimeOverride={startTimeOverride}
              />
            ) : null}
            {(preview || !pending) ? (
              <Button variant="outline" size="sm" onClick={reloadPreview} disabled={pending} className="w-full">
                {pending && multiProgress ? `Calcul ${multiProgress.done}/${multiProgress.total}…` : "Recalculer"}
              </Button>
            ) : null}
          </div>
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
                <div className="rounded-md border border-warn bg-warn-light/40 p-2 text-xs space-y-1.5">
                  {preview.warnings.map((w, i) => {
                    const isOtEligibleAlert =
                      w.includes("ot_eligible") || w.toLowerCase().includes("non eligible");
                    const isQuotaSaturatedAlert = w.includes("quota contractuel est déjà atteint");
                    return (
                      <div key={i}>
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-warn shrink-0 mt-0.5" />
                          <span className="flex-1">{w}</span>
                          {isOtEligibleAlert ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="gold"
                              onClick={activateOTEligibility}
                              disabled={pending}
                              className="shrink-0 h-6 px-2 text-[10px]"
                            >
                              {pending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Activer OT
                            </Button>
                          ) : null}
                        </div>
                        {isQuotaSaturatedAlert ? (
                          <div className="mt-1.5 ml-4 flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={clearAndReload}
                              disabled={pending}
                              className="h-6 px-2 text-[10px]"
                              title="Supprime tous les shifts de cet employé sur la semaine et recharge le preview"
                            >
                              <Eraser className="h-3 w-3" />
                              Vider la semaine
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-6 px-2 text-[10px]"
                            >
                              <Link
                                href={`/planning/all-sites?week=${weekISO}`}
                                target="_blank"
                                title="Voir les besoins non couverts sur la Vue d ensemble (autre onglet)"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Vue d'ensemble
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-6 px-2 text-[10px]"
                            >
                              <Link
                                href={`/planning/employees/${employeeId}`}
                                target="_blank"
                                title="Editer weekly_hours si tu veux augmenter le quota de cet employé"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Fiche employé
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
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

/**
 * Karim 19/05 : aperçu live des creneaux calcules a partir des overrides
 * choisis + preview de l employe. Permet a Karim de voir AVANT de generer
 * "OK ce sera 7.6h/jour de 10:00 a 18:06, sur 5 jours" et d ajuster ses
 * choix si besoin.
 */
function SuggestedSlot({
  preview,
  shiftHoursPerDay,
  maxDaysPerWeek,
  startTimeOverride,
}: {
  preview: EmpPlanPreview;
  shiftHoursPerDay: string;
  maxDaysPerWeek: string;
  startTimeOverride: string;
}) {
  const remaining = Math.max(0, preview.weekly_target - preview.already_contractual_hours);
  const userShiftH = shiftHoursPerDay ? Number(shiftHoursPerDay) : null;
  const userDays = maxDaysPerWeek ? Number(maxDaysPerWeek) : null;
  // Nb jours retenus :
  const days = userDays && userDays > 0 ? Math.min(userDays, preview.available_days) : preview.available_days;
  // Heures/jour :
  let hPerDay: number;
  if (userShiftH && userShiftH > 0) {
    hPerDay = Math.min(12, Math.max(1, userShiftH));
  } else if (days > 0) {
    hPerDay = remaining / days;
  } else {
    hPerDay = 0;
  }
  const totalCovered = Math.min(remaining, hPerDay * days);
  // Creneau type
  const start = /^\d{2}:\d{2}$/.test(startTimeOverride) ? startTimeOverride : "10:00";
  const breakMin = 30; // approximation, le solver utilise emp.default_pause_minutes
  const [sh, sm] = start.split(":").map(Number);
  const totalMin = sh * 60 + sm + Math.round(hPerDay * 60) + breakMin;
  const endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const isOverloaded = userShiftH != null && userDays != null && userShiftH * userDays < remaining - 1;

  return (
    <div className="rounded-md border border-gold/40 bg-gold-light/30 p-2 text-xs">
      <div className="font-bold mb-1 text-gold-dark">📊 Aperçu calcul (cette semaine)</div>
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        <div>Heures restantes : <span className="font-mono font-bold">{remaining.toFixed(1)}h</span></div>
        <div>Jours retenus : <span className="font-mono font-bold">{days}</span></div>
        <div>Heures / jour : <span className="font-mono font-bold">{hPerDay.toFixed(2)}h</span></div>
        <div>Couvertes : <span className="font-mono font-bold">{totalCovered.toFixed(1)}h</span></div>
      </div>
      <div className="mt-1.5 text-[11px]">
        Créneau type : <span className="font-mono font-bold">{start} – {end}</span>
        <span className="text-ink-3 ml-1">(pause {breakMin}min incluse)</span>
      </div>
      {isOverloaded ? (
        <div className="mt-1 text-[10px] text-warn font-bold">
          ⚠ {userShiftH}h × {userDays}j = {(userShiftH * userDays).toFixed(1)}h &lt; {remaining.toFixed(1)}h contractuel. Quota non saturé.
        </div>
      ) : null}
      {endH >= 23 ? (
        <div className="mt-1 text-[10px] text-danger font-bold">
          ⚠ Le shift se termine après 23h00 → ajuste l&apos;heure de début ou les heures/jour.
        </div>
      ) : null}
    </div>
  );
}
