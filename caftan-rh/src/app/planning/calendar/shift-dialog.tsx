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
  loadSiteNeedsForDayAction,
  loadEmployeeUnavailabilitiesForDayAction,
  loadEmployeeDayShiftsAction,
  copyShiftsToNextDaysAction,
} from "../actions";
import { useShiftUndo } from "@/components/shift-undo-provider";

type DaySuggestion = {
  id: string;
  start_time: string;
  end_time: string;
  headcount: number;
  role: string | null;
  is_critical: number | null;
};
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
  /** Karim 19/05 : explication "pourquoi/comment" generee par le solver. */
  generation_note?: string | null;
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
  const undoCtx = useShiftUndo();
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

  // Suggestions de creneaux du jour pour le site selectionne + heure d'ouverture
  // (= min start_time des creneaux is_enabled). Sert au snap d'alignement (30 min).
  const [daySuggestions, setDaySuggestions] = useState<DaySuggestion[]>([]);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);

  // Karim 15/05 : option "Recopier ce shift sur les N jours suivants" en
  // mode CREATION. Le copy applique le meme horaire/site sur day+1..day+N.
  const [copyNextDays, setCopyNextDays] = useState<number>(0);

  // Karim 15/05/2026 : shifts deja places ce jour pour cet employe. Sert au
  // pre-remplissage intelligent (creneau libre dans les heures d ouverture)
  // et a l UI pour montrer ce qui est deja pris.
  const [dayShifts, setDayShifts] = useState<Array<{ id: string; start_time: string; end_time: string; is_overtime: boolean | null }>>([]);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Indispos declarees par l'employe pour ce jour (warning souple si overlap).
  type Unavail = {
    id: string;
    start_time: string | null;
    end_time: string | null;
    day_of_week: number | null;
    date_specific: string | null;
    notes: string | null;
  };
  const [unavailabilities, setUnavailabilities] = useState<Unavail[]>([]);

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

  // Charge les creneaux suggeres + open/close du site quand le site ou la date change.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!siteId || siteId === "none") {
      setDaySuggestions([]);
      setOpenTime(null);
      setCloseTime(null);
      return;
    }
    (async () => {
      const r = await loadSiteNeedsForDayAction(siteId, date);
      if (cancelled) return;
      setDaySuggestions(r.needs);
      setOpenTime(r.open_time);
      setCloseTime(r.close_time);
    })().catch(() => {
      /* noop */
    });
    return () => {
      cancelled = true;
    };
  }, [open, siteId, date]);

  // Charge les indispos declarees par l'employe pour ce jour
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await loadEmployeeUnavailabilitiesForDayAction(employeeId, date);
      if (cancelled) return;
      setUnavailabilities(r.items);
    })().catch(() => {
      /* noop */
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, date]);

  // Charge les shifts deja places ce jour pour cet employe (= a eviter dans
  // le pre-remplissage). Exclut le shift en cours d edition pour ne pas
  // se bloquer soi-meme.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await loadEmployeeDayShiftsAction(employeeId, date, shift?.id ?? null);
      if (cancelled) return;
      setDayShifts(r.items);
    })().catch(() => {
      /* noop */
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, date, shift?.id]);

  // Reset prefillApplied a la fermeture pour que le prochain ouverture re-calcule.
  useEffect(() => {
    if (!open) setPrefillApplied(false);
  }, [open]);

  // Karim 15/05 : pre-remplissage intelligent en CREATION (pas en edition).
  // Avec la regle "shift >= 2h30 -> separation 10 min avec le suivant"
  // (Karim 15/05 v2) : le start propose = end du shift precedent + 10 min,
  // pour gain de temps et "logique humaine".
  useEffect(() => {
    if (!open) return;
    if (shift) return; // mode edition : on garde les heures du shift existant
    if (prefillApplied) return; // ne re-applique pas si l user a deja modifie
    if (openTime == null || closeTime == null) return; // attend les donnees site
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const toHHMM = (m: number) => {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    const MIN_LONG_DURATION_MIN = 150;
    const MIN_SEP_MIN = 10;
    const openMin = toMin(openTime);
    const closeMin = toMin(closeTime);
    if (closeMin - openMin < 60) return;

    const occupied = [...dayShifts]
      .map((s) => {
        const sM = toMin(s.start_time);
        const eM = toMin(s.end_time);
        return { s: sM, e: eM, dur: eM - sM };
      })
      .sort((a, b) => a.s - b.s);

    // Gaps avec buffer +10 min apres chaque shift >= 2h30.
    const gaps: Array<{ s: number; e: number; afterLongShift: boolean }> = [];
    let cursor = openMin;
    let lastWasLong = false;
    for (const occ of occupied) {
      if (occ.e <= cursor) continue;
      if (occ.s > cursor) {
        const endBuffer = occ.dur >= MIN_LONG_DURATION_MIN ? MIN_SEP_MIN : 0;
        gaps.push({
          s: cursor,
          e: Math.min(occ.s - endBuffer, closeMin),
          afterLongShift: lastWasLong,
        });
      }
      const afterBuffer = occ.dur >= MIN_LONG_DURATION_MIN ? MIN_SEP_MIN : 0;
      cursor = Math.max(cursor, occ.e + afterBuffer);
      lastWasLong = occ.dur >= MIN_LONG_DURATION_MIN;
      if (cursor >= closeMin) break;
    }
    if (cursor < closeMin) {
      gaps.push({ s: cursor, e: closeMin, afterLongShift: lastWasLong });
    }

    const usable = gaps.filter((g) => g.e - g.s >= 60);
    if (usable.length === 0) return;

    // Priorise les gaps APRES un shift (puisque la demande utilisateur etait
    // "10 min apres le shift qui le precede"). Sinon le 1er gap (= avant le
    // 1er shift) prevaut.
    // Tie-break : plus grand gap.
    usable.sort((a, b) => {
      // 1. Si shifts existent ce jour : on prefere les gaps APRES un shift
      //    (pour la regle "10 min apres"). Sinon n importe.
      if (occupied.length > 0) {
        if (a.afterLongShift && !b.afterLongShift) return -1;
        if (!a.afterLongShift && b.afterLongShift) return 1;
      }
      // 2. Plus grand gap (durabilite)
      const da = a.e - a.s;
      const db = b.e - b.s;
      if (db !== da) return db - da;
      // 3. Plus tot dans la journee
      return a.s - b.s;
    });
    const best = usable[0];
    const proposedStart = best.s;
    const proposedEnd = Math.min(proposedStart + 8 * 60, best.e);

    setStartTime(toHHMM(proposedStart));
    setEndTime(toHHMM(proposedEnd));
    setPrefillApplied(true);
  }, [open, shift, openTime, closeTime, dayShifts, prefillApplied]);

  /**
   * Indispos qui chevauchent le creneau (startTime, endTime) saisi.
   * Indispo sans bornes horaires = journee entiere = overlap automatique.
   */
  const overlappingUnavail = useMemo(() => {
    if (!startTime || !endTime || endTime <= startTime) return [];
    const sMin = (() => {
      const [h, m] = startTime.split(":").map(Number);
      return h * 60 + m;
    })();
    const eMin = (() => {
      const [h, m] = endTime.split(":").map(Number);
      return h * 60 + m;
    })();
    return unavailabilities.filter((u) => {
      if (!u.start_time || !u.end_time) return true; // journee entiere
      const [uSh, uSm] = u.start_time.split(":").map(Number);
      const [uEh, uEm] = u.end_time.split(":").map(Number);
      const uS = uSh * 60 + uSm;
      const uE = uEh * 60 + uEm;
      return sMin < uE && eMin > uS;
    });
  }, [startTime, endTime, unavailabilities]);

  /**
   * Applique l'alignement d'office (decision Karim 2026-05-11) : si l'heure
   * de debut tombe dans les 30 min apres l'ouverture du magasin, snap a
   * l'heure d'ouverture pile. Pas d'alignement si openTime inconnu.
   */
  function snapToOpening(t: string): string {
    if (!openTime) return t;
    const [oH, oM] = openTime.split(":").map(Number);
    const [tH, tM] = t.split(":").map(Number);
    const openMin = oH * 60 + oM;
    const tMin = tH * 60 + tM;
    if (tMin >= openMin && tMin <= openMin + 30) return openTime;
    return t;
  }

  function pickSuggestion(need: DaySuggestion) {
    const snapped = snapToOpening(need.start_time.slice(0, 5));
    setStartTime(snapped);
    setEndTime(need.end_time.slice(0, 5));
  }

  // Karim 15/05/2026 : gaps libres dans les heures d ouverture (= entre les
  // shifts deja places ce jour). Affiches comme chips cliquables pour
  // pre-remplir start/end.
  // Karim 15/05 v2 : "chaque shift de minimum 2h30 doit etre separe du shift
  // suivant de 10 a 15 minutes". On applique une pause MIN_SEP_MIN apres
  // chaque shift >= MIN_LONG_DURATION_MIN, donc le gap d apres ce shift
  // commence a shift.end + 10 min. Symétrique : un shift >= 2h30 a venir
  // impose end_gap = next.start - 10.
  const availableGaps = useMemo(() => {
    if (!openTime || !closeTime) return [];
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const toHHMM = (m: number) => {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    const MIN_LONG_DURATION_MIN = 150; // 2h30 = 150 min
    const MIN_SEP_MIN = 10;
    const openMin = toMin(openTime);
    const closeMin = toMin(closeTime);
    if (closeMin - openMin < 60) return [];

    const occupied = [...dayShifts]
      .map((s) => {
        const sM = toMin(s.start_time);
        const eM = toMin(s.end_time);
        return { s: sM, e: eM, dur: eM - sM };
      })
      .sort((a, b) => a.s - b.s);

    const gaps: Array<{ start: string; end: string; minutes: number; label: string }> = [];
    let cursor = openMin;
    let position = 0;
    for (let i = 0; i < occupied.length; i++) {
      const occ = occupied[i];
      if (occ.e <= cursor) continue;
      if (occ.s > cursor) {
        const endBuffer = occ.dur >= MIN_LONG_DURATION_MIN ? MIN_SEP_MIN : 0;
        const gapStart = cursor;
        const gapEnd = Math.min(occ.s - endBuffer, closeMin);
        if (gapEnd - gapStart >= 60) {
          gaps.push({
            start: toHHMM(gapStart),
            end: toHHMM(gapEnd),
            minutes: gapEnd - gapStart,
            label: position === 0 ? "avant" : "entre",
          });
          position += 1;
        }
      }
      const afterBuffer = occ.dur >= MIN_LONG_DURATION_MIN ? MIN_SEP_MIN : 0;
      cursor = Math.max(cursor, occ.e + afterBuffer);
      if (cursor >= closeMin) break;
    }
    if (cursor < closeMin) {
      const gapStart = cursor;
      const gapEnd = closeMin;
      if (gapEnd - gapStart >= 60) {
        gaps.push({
          start: toHHMM(gapStart),
          end: toHHMM(gapEnd),
          minutes: gapEnd - gapStart,
          label: occupied.length === 0 ? "journée complète" : "après",
        });
      }
    }
    return gaps;
  }, [openTime, closeTime, dayShifts]);

  function pickGap(g: { start: string; end: string; minutes: number }) {
    setStartTime(g.start);
    // Si le gap est plus court que 8h, on prend toute sa longueur ; sinon 8h max.
    const maxMin = Math.min(g.minutes, 8 * 60);
    const endMin = (() => {
      const [h, m] = g.start.split(":").map(Number);
      return h * 60 + m + maxMin;
    })();
    const eh = Math.floor(endMin / 60);
    const em = endMin % 60;
    setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
  }

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
        {shift?.generation_note ? (
          <details className="rounded-md border border-gold/40 bg-gold-light/30 p-2 text-[11px]">
            <summary className="cursor-pointer font-bold text-gold-dark">
              🔍 Pourquoi ce shift ? (audit solver)
            </summary>
            <div className="mt-1.5 text-ink-2 leading-relaxed whitespace-pre-wrap">
              {shift.generation_note.split(" · ").map((part, i) => (
                <div key={i} className="py-0.5 border-b border-line/40 last:border-0">
                  {i + 1}. {part}
                </div>
              ))}
            </div>
          </details>
        ) : null}
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
              if (r?.error) {
                toast.error(r.error);
                return;
              }
              const createdIds = (r?.created_ids ?? []) as string[];
              const label = shift
                ? r?.split
                  ? `Shift mis à jour + heures sup ajoutées (split à ${r.split.split_at})`
                  : "Shift mis à jour"
                : r?.split
                  ? `Shift créé fractionné (${r.split.regular_hours}h contrat + ${r.split.overtime_hours}h sup)`
                  : "Shift créé";

              // Karim 15/05 : recopie sur jours suivants (CREATION + EDITION).
              // EDIT : on copie le shift modifie (shift.id, qui contient
              // l update qu on vient de faire) + d eventuels segments OT
              // crees en bonus.
              // CREATE : on copie uniquement les nouveaux rows (createdIds).
              if (copyNextDays > 0) {
                const sourceIds = shift
                  ? [shift.id, ...createdIds]
                  : createdIds;
                if (sourceIds.length > 0) {
                  const cp = await copyShiftsToNextDaysAction({
                    shiftIds: sourceIds,
                    daysCount: copyNextDays,
                  });
                  if (cp.error) {
                    toast.error(`Recopie échouée : ${cp.error}`);
                  } else if ((cp.created ?? 0) > 0) {
                    toast.success(
                      `${cp.created} copie(s) sur les ${copyNextDays} jour(s) suivant(s)${
                        (cp.skipped ?? 0) > 0 ? ` (${cp.skipped} doublons evites)` : ""
                      }.`,
                    );
                  }
                }
              }

              if (createdIds.length > 0) {
                undoCtx.push({
                  label,
                  undo: async () => {
                    for (const sid of createdIds) {
                      await deleteShiftAction(sid);
                    }
                  },
                });
              } else {
                toast.success(label);
              }
              onOpenChange(false);
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
                onBlur={(e) => {
                  const snapped = snapToOpening(e.target.value);
                  if (snapped !== e.target.value) setStartTime(snapped);
                }}
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
          <div>
            <Label htmlFor="copy_next_days" className="flex items-center gap-1">
              Recopier {shift ? "ce shift (avec ses modifs) " : ""}sur les jours suivants
              <span className="text-[10px] text-ink-3 font-normal">(0 = pas de recopie)</span>
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                id="copy_next_days"
                type="number"
                min={0}
                max={31}
                value={copyNextDays}
                onChange={(e) => setCopyNextDays(Math.max(0, Math.min(31, Number(e.target.value) || 0)))}
                className="w-24"
              />
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 3, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCopyNextDays(n)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      copyNextDays === n
                        ? "border-gold bg-gold text-[#1a1a0d] font-bold"
                        : "border-line bg-surface hover:border-gold"
                    }`}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              {copyNextDays > 0 ? (
                <span className="text-[11px] text-success font-bold">
                  → {copyNextDays} copie{copyNextDays > 1 ? "s" : ""} (doublons skipped)
                </span>
              ) : null}
            </div>
            {shift ? (
              <div className="text-[10px] text-ink-3 mt-1 italic">
                Les copies prendront les horaires modifiés ci-dessus, sur les {copyNextDays || "N"} jours après le {date}.
              </div>
            ) : null}
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
              {siteId !== "none" && (openTime || daySuggestions.length > 0 || availableGaps.length > 0) ? (
                <div className="mt-2 rounded-md border border-line bg-surface-2/40 p-2 space-y-1.5">
                  {openTime ? (
                    <div className="text-[11px] text-ink-2">
                      Magasin ouvert ce jour :{" "}
                      <span className="font-mono font-bold">{openTime}</span>
                      {closeTime ? <> – <span className="font-mono font-bold">{closeTime}</span></> : null}.
                      Choisir un créneau commençant dans les 30 min après{" "}
                      <span className="font-mono">{openTime}</span> aligne automatiquement à l'ouverture.
                    </div>
                  ) : null}
                  {availableGaps.length > 0 && !shift ? (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                        Créneaux libres ({dayShifts.length > 0 ? `${dayShifts.length} shift${dayShifts.length > 1 ? "s" : ""} déjà placé${dayShifts.length > 1 ? "s" : ""}` : "journée vide"})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableGaps.map((g, i) => (
                          <button
                            key={`gap-${i}`}
                            type="button"
                            onClick={() => pickGap(g)}
                            title={`Pré-remplir ${g.start} – ${g.end} (${(g.minutes / 60).toFixed(1)}h disponibles)`}
                            className="text-[11px] font-mono px-2 py-1 rounded border border-success/40 bg-success-light/30 text-success hover:bg-success-light"
                          >
                            <span className="text-[9px] uppercase tracking-wider mr-1 opacity-70">{g.label}</span>
                            {g.start}–{g.end}
                            <span className="text-ink-3 ml-1">({(g.minutes / 60).toFixed(1)}h)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {daySuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {daySuggestions.map((s) => {
                        const startHHMM = s.start_time.slice(0, 5);
                        const endHHMM = s.end_time.slice(0, 5);
                        const snapped = snapToOpening(startHHMM);
                        const snapping = snapped !== startHHMM;
                        const crit = Number(s.is_critical ?? 0);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => pickSuggestion(s)}
                            title={
                              snapping
                                ? `Alignement d'office : ${startHHMM} → ${snapped} (tolérance 30 min)`
                                : `Pré-remplir ${startHHMM} – ${endHHMM}`
                            }
                            className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                              crit === 2
                                ? "border-danger/40 bg-danger-light/40 text-danger hover:bg-danger-light"
                                : crit === 1
                                  ? "border-warn/40 bg-warn-light/40 text-warn hover:bg-warn-light"
                                  : "border-line bg-surface hover:border-gold hover:bg-gold-light/30"
                            }`}
                          >
                            {snapping ? snapped : startHHMM}–{endHHMM}
                            {s.role ? <span className="text-ink-3 ml-1">· {s.role}</span> : null}
                            {snapping ? <span className="ml-1 text-success">⇲</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-ink-3 italic">
                      Aucun besoin défini pour ce jour sur ce site.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Warning indispo declaree par l'employe (decision Karim souple, pas blocage) */}
          {overlappingUnavail.length > 0 ? (
            <div
              className="rounded-md border border-warn bg-warn-light/50 p-3 text-xs space-y-1"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-ink">
                    {overlappingUnavail.length === 1
                      ? `${employeeName} a déclaré une indispo qui chevauche ce créneau`
                      : `${overlappingUnavail.length} indispos de ${employeeName} chevauchent ce créneau`}
                  </div>
                  <ul className="text-ink-2 mt-1 space-y-0.5">
                    {overlappingUnavail.slice(0, 3).map((u) => (
                      <li key={u.id}>
                        •{" "}
                        {u.start_time && u.end_time ? (
                          <span className="font-mono">
                            {u.start_time.slice(0, 5)}–{u.end_time.slice(0, 5)}
                          </span>
                        ) : (
                          <span className="italic">journée entière</span>
                        )}
                        {u.date_specific ? " (date précise)" : " (récurrente)"}
                        {u.notes ? <> · <span className="text-ink-3">{u.notes}</span></> : null}
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-ink-3 italic mt-1">
                    Tu peux valider quand même, mais préviens-la·le si possible.
                  </div>
                </div>
              </div>
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

          {/* Bloc heures sup -- ressort visuellement quand projected.isOver */}
          <div
            className={`rounded-md border p-2.5 space-y-2 transition-colors ${
              isOvertime
                ? "border-orange-400 bg-orange-50"
                : projection?.isOver
                  ? "border-warn bg-warn-light/40"
                  : "border-line bg-surface-2/40"
            }`}
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="cursor-pointer h-4 w-4"
              />
              <span className={`font-bold ${isOvertime ? "text-orange-700" : projection?.isOver ? "text-warn" : ""}`}>
                🔥 Marquer en heures sup
              </span>
              <span className="text-[11px] text-ink-3">
                (au-delà du contrat hebdo)
              </span>
              {projection?.isOver && !isOvertime ? (
                <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-warn text-white">
                  Conseillé
                </span>
              ) : null}
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
                  <option value="1.0">×1.0</option>
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
