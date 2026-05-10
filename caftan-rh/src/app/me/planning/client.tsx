"use client";

import { useState } from "react";
import { Calendar, List, LayoutGrid, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { addDays, parseISODate, toISODate, shiftHours } from "@/lib/planning";
import { ShareDialog } from "@/app/planning/employees/[id]/calendar/share-dialog";
import { t, dateLocaleStr, type Locale, type TranslationKey } from "@/lib/i18n";

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  notes: string | null;
  site: { code: string; name: string; color: string | null } | null;
};

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  weekly_hours: number | null;
  department_name: string | null;
};

const SHORT_DAY_KEYS: TranslationKey[] = [
  "weekday.short.0",
  "weekday.short.1",
  "weekday.short.2",
  "weekday.short.3",
  "weekday.short.4",
  "weekday.short.5",
  "weekday.short.6",
];

export function MyPlanningClient({
  employee,
  mondayISO,
  upcoming,
  weekShifts,
  locale,
}: {
  employee: Employee;
  mondayISO: string;
  upcoming: Shift[];
  weekShifts: Shift[];
  locale: Locale;
}) {
  const [view, setView] = useState<"week" | "list">("week");
  const [shareOpen, setShareOpen] = useState(false);

  const monday = parseISODate(mondayISO);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const byDate = new Map<string, Shift[]>();
  for (const s of weekShifts) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }

  const totalH = weekShifts.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
    0,
  );

  const localeStr = dateLocaleStr(locale);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("planning.title", locale)}</h1>
          <p className="text-sm text-ink-2">
            {employee.job_title ?? "—"} · {employee.department_name ?? t("planning.no_department", locale)} · {t("planning.weekly_hours_short", locale, { hours: employee.weekly_hours ?? 38 })}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 font-bold transition-colors inline-flex items-center gap-1 ${
                view === "week"
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-ink-2 hover:bg-surface-2"
              }`}
            >
              <LayoutGrid className="h-3 w-3" /> {t("planning.view_week", locale)}
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 font-bold transition-colors inline-flex items-center gap-1 ${
                view === "list"
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-ink-2 hover:bg-surface-2"
              }`}
            >
              <List className="h-3 w-3" /> {t("planning.view_list", locale)}
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="h-3.5 w-3.5" /> {t("planning.share", locale)}
          </Button>
        </div>
      </div>

      {view === "week" ? (
        <>
          <div className="text-sm text-ink-2">
            {t("planning.week_of", locale, {
              date: monday.toLocaleDateString(localeStr, { day: "2-digit", month: "long" }),
            })}
            {" · "}
            <span className="font-bold">{totalH.toFixed(1)}{t("common.hours", locale)}</span>
          </div>
          <div className="overflow-x-auto scroll-smooth-touch -mx-2 px-2 pb-2">
            <div className="grid grid-flow-col auto-cols-[minmax(170px,1fr)] lg:grid-flow-row lg:grid-cols-7 lg:auto-cols-auto gap-2">
              {days.map((d, i) => {
                const dISO = toISODate(d);
                const dShifts = byDate.get(dISO) ?? [];
                const dh = dShifts.reduce(
                  (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
                  0,
                );
                const isToday = dISO === toISODate(new Date());
                return (
                  <Card key={i} className={isToday ? "ring-2 ring-gold" : ""}>
                    <div className="px-3 py-2 border-b border-line">
                      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                        {t(SHORT_DAY_KEYS[i], locale)}
                      </div>
                      <div className="font-bold">
                        {d.toLocaleDateString(localeStr, { day: "2-digit", month: "short" })}
                      </div>
                      {dh > 0 ? (
                        <div className="text-[10px] text-ink-3 font-mono">{dh.toFixed(1)}{t("common.hours", locale)}</div>
                      ) : null}
                    </div>
                    <div className="p-2 space-y-1">
                      {dShifts.length === 0 ? (
                        <div className="text-[11px] text-ink-3 italic text-center py-2">—</div>
                      ) : (
                        dShifts.map((s) => (
                          <div
                            key={s.id}
                            className="rounded px-2 py-1 text-xs"
                            style={{
                              backgroundColor: s.site?.color
                                ? `${s.site.color}20`
                                : "rgb(245 235 200 / 0.5)",
                              borderLeft: `3px solid ${s.site?.color ?? "#c9a34d"}`,
                            }}
                          >
                            <div className="font-bold font-mono">
                              {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                            </div>
                            {s.site ? (
                              <div className="text-[10px] truncate">{s.site.code} · {s.site.name}</div>
                            ) : s.location ? (
                              <div className="text-[10px] text-ink-3 truncate">{s.location}</div>
                            ) : null}
                            {s.position ? (
                              <div className="text-[10px] text-ink-3 truncate">{s.position}</div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      ) : upcoming.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <Calendar className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("planning.no_shifts", locale)}</p>
            <p className="text-xs text-ink-3 mt-1">{t("planning.no_shifts_hint", locale)}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {upcoming.map((s) => {
            const hours = shiftHours(s.start_time, s.end_time, s.break_minutes);
            return (
              <Card key={s.id}>
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="w-12 h-12 rounded-md bg-gold-light text-gold-dark flex flex-col items-center justify-center shrink-0">
                    <div className="text-[10px] uppercase font-bold leading-none">
                      {new Date(s.date).toLocaleDateString(localeStr, { weekday: "short" })}
                    </div>
                    <div className="font-bold text-base leading-none mt-1">
                      {new Date(s.date).getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-bold">
                      {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      <span className="font-normal text-ink-3 text-xs ml-2">
                        ({hours.toFixed(1)}{t("common.hours", locale)}{s.break_minutes ? ` · ${t("planning.break_label", locale, { n: s.break_minutes })}` : ""})
                      </span>
                    </div>
                    <div className="text-xs text-ink-2 mt-0.5">
                      {s.position ?? t("planning.position_tbd", locale)} · {s.site?.name ?? s.location ?? "—"}
                    </div>
                    {s.notes ? <div className="text-xs text-ink-3 mt-1 italic">{s.notes}</div> : null}
                  </div>
                  <span className="text-[11px] text-ink-3 hidden md:inline">{formatDate(s.date)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        employeeId={employee.id}
        employeeName={employee.full_name}
        weekISO={mondayISO}
        isSelf
      />
    </div>
  );
}
