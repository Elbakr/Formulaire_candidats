"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays, toISODate, shiftHours } from "@/lib/planning";
import { ShiftDialog } from "@/app/planning/calendar/shift-dialog";
import { moveShiftAction } from "@/app/planning/actions";
import { useRealtime } from "@/hooks/use-realtime";

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  is_overtime?: boolean | null;
  overtime_multiplier?: number | null;
  site: { code: string; name: string; color: string | null } | null;
  site_id?: string | null;
  notes?: string | null;
};

type SiteOption = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

export function WeekBoard({
  monday,
  shifts,
  employeeId,
  employeeName,
  sites,
  preferredSiteIds,
  canEdit,
}: {
  monday: Date;
  shifts: Shift[];
  employeeId: string;
  employeeName: string;
  sites: SiteOption[];
  preferredSiteIds: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<
    | { date: string; shift?: Shift }
    | null
  >(null);
  // Karim 15/05 : drag-and-drop d un shift d un jour a l autre (memes
  // employe, change date). + tap-to-move (long-press 500ms sur mobile).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const shiftById = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of shifts) m.set(s.id, s);
    return m;
  }, [shifts]);
  const selectedShift = selectedId ? shiftById.get(selectedId) ?? null : null;

  function moveTo(shiftId: string, toDate: string) {
    setDraggingId(null);
    setDropHover(null);
    setSelectedId(null);
    (async () => {
      const r = await moveShiftAction({ shiftId, toDate });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Shift déplacé.");
        router.refresh();
      }
    })();
  }

  function onShiftTouchStart(shiftId: string, ev: React.TouchEvent) {
    const t = ev.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    longPressFiredRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      try { navigator.vibrate?.(40); } catch { /* noop */ }
      setSelectedId(shiftId);
    }, 500);
  }
  function onShiftTouchMove(ev: React.TouchEvent) {
    const t = ev.touches[0];
    const start = touchStartRef.current;
    if (!start) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 8 || dy > 8) {
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
    }
  }
  function onShiftTouchEnd() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    touchStartRef.current = null;
  }

  useRealtime("shifts", () => router.refresh());

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }

  return (
    <>
      <div className="overflow-x-auto scroll-smooth-touch -mx-2 px-2 pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(170px,1fr)] lg:grid-flow-row lg:grid-cols-7 lg:auto-cols-auto gap-2">
          {days.map((d, i) => {
            const dISO = toISODate(d);
            const dShifts = byDate.get(dISO) ?? [];
            const dh = dShifts.reduce(
              (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
              0,
            );
            const isDropHover = dropHover === dISO;
            const isMoveTarget = !!selectedId;
            const isSourceDay = selectedShift?.date === dISO;
            return (
              <Card
                key={i}
                role={canEdit && isMoveTarget && !isSourceDay ? "button" : undefined}
                onClick={() => {
                  if (!canEdit) return;
                  if (selectedId && !isSourceDay) {
                    moveTo(selectedId, dISO);
                  }
                }}
                onDragOver={(ev) => {
                  if (!canEdit || !draggingId) return;
                  ev.preventDefault();
                  setDropHover(dISO);
                }}
                onDragLeave={() => {
                  if (dropHover === dISO) setDropHover(null);
                }}
                onDrop={(ev) => {
                  if (!canEdit) return;
                  ev.preventDefault();
                  const id = ev.dataTransfer.getData("text/plain");
                  if (id) moveTo(id, dISO);
                }}
                className={`transition-colors ${
                  isDropHover ? "ring-2 ring-gold ring-inset bg-gold-light/40" : ""
                } ${
                  canEdit && isMoveTarget && !isSourceDay
                    ? "cursor-pointer hover:ring-2 hover:ring-gold/60 hover:bg-gold-light/20"
                    : ""
                }`}
              >
                <div className="px-3 py-2 border-b border-line">
                  <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                    {d.toLocaleDateString("fr-BE", { weekday: "short" })}
                  </div>
                  <div className="font-bold">
                    {d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                  </div>
                  {dh > 0 ? (
                    <div className="text-[10px] text-ink-3 font-mono">{dh.toFixed(1)}h</div>
                  ) : null}
                </div>
                <div className="p-2 space-y-1">
                  {dShifts.length === 0 ? (
                    <div className="text-[11px] text-ink-3 italic text-center py-2">—</div>
                  ) : (
                    dShifts.map((s) => {
                      const inner = (
                        <>
                          <div className="font-bold font-mono flex items-center gap-1">
                            <span>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                            {s.is_overtime ? (
                              <span className="ml-auto text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded bg-orange-100 text-orange-700">
                                H. sup{s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}
                              </span>
                            ) : null}
                          </div>
                          {s.site ? (
                            <div className="text-[10px] truncate">{s.site.code} · {s.site.name}</div>
                          ) : s.location ? (
                            <div className="text-[10px] text-ink-3 truncate">{s.location}</div>
                          ) : null}
                        </>
                      );
                      const cls = `block w-full text-left rounded px-2 py-1 text-xs ${
                        s.is_overtime ? "border border-dashed border-orange-400" : ""
                      } ${canEdit ? "hover:ring-1 hover:ring-gold cursor-pointer" : ""}`;
                      const style: React.CSSProperties = {
                        backgroundColor: s.is_overtime
                          ? "rgb(255 237 213 / 0.7)"
                          : s.site?.color
                            ? `${s.site.color}20`
                            : "rgb(245 235 200 / 0.5)",
                        borderLeft: s.is_overtime
                          ? "3px solid #f97316"
                          : `3px solid ${s.site?.color ?? "#c9a34d"}`,
                      };
                      const title = s.is_overtime
                        ? `Heures sup.${s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}${canEdit ? " — clique pour éditer" : ""}`
                        : canEdit
                          ? "Clique pour éditer"
                          : undefined;
                      const isSel = selectedId === s.id;
                      return canEdit ? (
                        <button
                          key={s.id}
                          draggable
                          onDragStart={(ev) => {
                            ev.dataTransfer.setData("text/plain", s.id);
                            ev.dataTransfer.effectAllowed = "move";
                            setDraggingId(s.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropHover(null);
                          }}
                          onTouchStart={(ev) => onShiftTouchStart(s.id, ev)}
                          onTouchMove={onShiftTouchMove}
                          onTouchEnd={onShiftTouchEnd}
                          onTouchCancel={onShiftTouchEnd}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            // Long-press a deja arme la selection -> annule edit
                            if (longPressFiredRef.current) {
                              longPressFiredRef.current = false;
                              return;
                            }
                            // Si on est en mode select, tap sur un autre shift bascule
                            if (selectedId && selectedId !== s.id) {
                              setSelectedId(s.id);
                              return;
                            }
                            // Si on retape le shift selectionne, annule selection
                            if (selectedId === s.id) {
                              setSelectedId(null);
                              return;
                            }
                            setEditing({ date: dISO, shift: s });
                          }}
                          className={`${cls} cursor-grab active:cursor-grabbing transition-all ${
                            draggingId === s.id ? "opacity-40" : ""
                          } ${
                            isSel ? "ring-2 ring-gold ring-offset-1 ring-offset-white shadow-md scale-[1.02]" : ""
                          }`}
                          style={style}
                          title={title}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={s.id} className={cls} style={style} title={title}>
                          {inner}
                        </div>
                      );
                    })
                  )}
                  {canEdit ? (
                    <button
                      onClick={() => setEditing({ date: dISO })}
                      className="w-full mt-0.5 text-[10px] text-ink-3 hover:text-gold-dark py-2 md:py-1 min-h-[40px] md:min-h-0 rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-0.5"
                    >
                      <Plus className="h-2.5 w-2.5" /> ajouter
                    </button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {editing ? (
        <ShiftDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          employeeId={employeeId}
          employeeName={employeeName}
          date={editing.date}
          shift={
            editing.shift
              ? {
                  id: editing.shift.id,
                  start_time: editing.shift.start_time,
                  end_time: editing.shift.end_time,
                  break_minutes: editing.shift.break_minutes,
                  position: editing.shift.position,
                  location: editing.shift.location,
                  site_id: editing.shift.site_id ?? null,
                  notes: editing.shift.notes ?? null,
                  is_overtime: editing.shift.is_overtime ?? false,
                  overtime_multiplier: editing.shift.overtime_multiplier ?? null,
                }
              : undefined
          }
          sites={sites}
          preferredSiteIds={preferredSiteIds}
        />
      ) : null}

      {/* Bottom bar deplacement -- visible quand un shift est selectionne
          via long-press (mobile) ou click apres long-press (desktop).
          Karim 15/05. */}
      {selectedShift ? (
        <div className="fixed inset-x-0 bottom-0 z-30 print:hidden">
          <div className="mx-auto max-w-3xl m-2 rounded-lg bg-ink text-white shadow-2xl border border-gold/40">
            <div className="flex items-center gap-3 p-3">
              <ArrowRight className="h-4 w-4 text-gold shrink-0" />
              <div className="flex-1 text-xs leading-tight">
                <div className="font-bold">
                  Shift sélectionné : {selectedShift.start_time.slice(0, 5)}-{selectedShift.end_time.slice(0, 5)}
                </div>
                <div className="text-white/70">
                  Actuellement : {selectedShift.date}
                  {selectedShift.site ? ` • ${selectedShift.site.code} ${selectedShift.site.name}` : ""}
                </div>
                <div className="text-gold text-[11px] mt-0.5">
                  Tape un autre jour pour déplacer.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(null)}
                aria-label="Annuler la sélection"
                className="text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
