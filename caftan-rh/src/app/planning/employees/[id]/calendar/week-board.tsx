"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { addDays, toISODate, shiftHours } from "@/lib/planning";
import { ShiftDialog } from "@/app/planning/calendar/shift-dialog";
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
            return (
              <Card key={i}>
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
                      return canEdit ? (
                        <button
                          key={s.id}
                          onClick={() => setEditing({ date: dISO, shift: s })}
                          className={cls}
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
    </>
  );
}
