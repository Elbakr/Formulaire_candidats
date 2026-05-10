"use client";

import { useMemo, useState } from "react";
import { CalendarOff, Plus, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays, parseISODate, toISODate } from "@/lib/planning";
import { DAY_LABELS_FR_LONG_FROM_SUNDAY } from "@/lib/sites-shared";
import { ShiftDialog } from "../../calendar/shift-dialog";

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  site_id: string | null;
  notes: string | null;
  is_overtime?: boolean | null;
  overtime_multiplier?: number | null;
  employee: { id: string; full_name: string; job_title: string | null } | null;
};

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

type Member = {
  employee_id: string;
  full_name: string;
  job_title: string | null;
};

type Holiday = {
  id: string;
  date: string;
  label: string;
  kind: string;
  priority?: number | null;
  tradition?: string | null;
};

type Closure = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
};

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  light_color: string | null;
};

type EditingState = {
  employeeId: string;
  employeeName: string;
  date: string;
  shift?: Shift;
  defaults?: { start_time: string; end_time: string; position: string | null };
};

function shiftOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return h * 60 + mm;
  };
  return m(s1) < m(e2) && m(e1) > m(s2);
}

export function SiteWeekBoard({
  site,
  mondayISO,
  shifts,
  needs,
  members,
  closures = [],
  holidays = [],
}: {
  site: Site;
  mondayISO: string;
  shifts: Shift[];
  needs: Need[];
  members: Member[];
  closures?: Closure[];
  holidays?: Holiday[];
}) {
  const [editing, setEditing] = useState<EditingState | null>(null);

  const monday = useMemo(() => parseISODate(mondayISO), [mondayISO]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [mondayISO],
  );

  const needsByDow = useMemo(() => {
    const m = new Map<number, Need[]>();
    for (const n of needs) {
      const arr = m.get(n.day_of_week) ?? [];
      arr.push(n);
      m.set(n.day_of_week, arr);
    }
    return m;
  }, [needs]);

  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const arr = m.get(s.date) ?? [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [shifts]);

  const sitesForDialog = [
    { id: site.id, code: site.code, name: site.name, color: site.color },
  ];
  const preferredSiteIds = [site.id];

  function isClosed(dateISO: string) {
    return closures.some((c) => dateISO >= c.start_date && dateISO <= c.end_date);
  }

  function holidayFor(dateISO: string): Holiday | null {
    const list = holidays.filter((h) => h.date === dateISO);
    if (list.length === 0) return null;
    return list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  }

  return (
    <>
      {/* Mobile : scroll horizontal — chaque colonne min-w-[280px] (lisibilité
          sur petit écran). Desktop (lg+) : 7 colonnes alignées sur une ligne. */}
      <div className="overflow-x-auto scroll-smooth-touch -mx-2 px-2 pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] lg:grid-flow-row lg:grid-cols-7 lg:auto-cols-auto gap-2">
          {days.map((d, i) => {
          const dISO = toISODate(d);
          const dow = d.getDay();
          const dayNeeds = needsByDow.get(dow) ?? [];
          const dayShifts = shiftsByDate.get(dISO) ?? [];
          const dayLabel = DAY_LABELS_FR_LONG_FROM_SUNDAY[dow];
          const closed = isClosed(dISO);
          const hol = holidayFor(dISO);

          return (
            <Card key={i} className="overflow-hidden">
              <div
                className="px-3 py-2 border-b border-line"
                style={{ backgroundColor: site.light_color ?? undefined }}
              >
                <div className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                  {dayLabel}
                </div>
                <div className="font-bold flex items-center justify-between gap-2">
                  <span>
                    {d.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
                  </span>
                  {closed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gold-dark bg-gold-light rounded-full px-2 py-0.5">
                      <CalendarOff className="h-3 w-3" /> Fermé
                    </span>
                  ) : null}
                </div>
                {hol ? (
                  <div className="text-[10px] mt-0.5 text-danger font-bold uppercase tracking-wider truncate">
                    {hol.label}
                  </div>
                ) : null}
              </div>

              {dayNeeds.length === 0 ? (
                <div className="p-3 text-xs text-ink-3 italic">Site fermé.</div>
              ) : (
                <div className="p-3 space-y-2">
                  {dayNeeds.map((n) => {
                    const matching = dayShifts.filter((s) =>
                      shiftOverlaps(
                        s.start_time.slice(0, 5),
                        s.end_time.slice(0, 5),
                        n.start_time.slice(0, 5),
                        n.end_time.slice(0, 5),
                      ),
                    );
                    const cov = matching.length;
                    const tone =
                      cov >= n.headcount
                        ? "text-success bg-success-light"
                        : cov === 0
                          ? "text-danger bg-danger-light"
                          : "text-warn bg-warn-light";
                    const uncovered = cov < n.headcount;
                    const usedIds = new Set(matching.map((s) => s.employee_id));
                    const candidates = members.filter((m) => !usedIds.has(m.employee_id));

                    return (
                      <div
                        key={n.id}
                        className="rounded-md border border-line p-2 space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="font-mono font-bold">
                            {n.start_time.slice(0, 5)}–{n.end_time.slice(0, 5)}
                          </div>
                          <span
                            className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${tone}`}
                          >
                            {cov}/{n.headcount}
                          </span>
                        </div>
                        {n.role ? (
                          <div className="text-[10px] text-ink-3">{n.role}</div>
                        ) : null}
                        {matching.length > 0 ? (
                          <ul className="text-xs space-y-0.5">
                            {matching.map((s) => (
                              <li
                                key={s.id}
                                className={`flex items-center gap-1 rounded px-1 py-1 hover:bg-gold-light/60 transition-colors ${
                                  s.is_overtime
                                    ? "bg-orange-50 border border-dashed border-orange-300"
                                    : ""
                                }`}
                              >
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                                    s.is_overtime ? "bg-orange-500" : "bg-gold-dark"
                                  }`}
                                />
                                <span className="flex-1 min-w-0">
                                  <EmployeeQuickLink
                                    employeeId={s.employee_id}
                                    fullName={s.employee?.full_name ?? "—"}
                                    fullWidth
                                  />
                                </span>
                                {s.is_overtime ? (
                                  <span
                                    title={`Heures sup.${s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}`}
                                    className="text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded bg-orange-100 text-orange-700"
                                  >
                                    H. sup
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  title="Modifier ce shift"
                                  onClick={() =>
                                    setEditing({
                                      employeeId: s.employee_id,
                                      employeeName: s.employee?.full_name ?? "—",
                                      date: s.date,
                                      shift: s,
                                    })
                                  }
                                  className="text-ink-3 hover:text-gold-dark font-mono text-[10px] px-1 py-0.5 rounded hover:bg-gold-light min-h-[28px]"
                                >
                                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[10px] text-danger italic">
                            Aucun shift n'a couvert ce créneau
                          </div>
                        )}
                        {uncovered ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="w-full mt-1 text-[10px] text-ink-3 hover:text-gold-dark py-1.5 min-h-[36px] rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-1"
                              >
                                <UserPlus className="h-3 w-3" /> Ajouter un employé
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                              <DropdownMenuLabel>Membres du site</DropdownMenuLabel>
                              {candidates.length === 0 ? (
                                <div className="px-2 py-2 text-xs text-ink-3 italic">
                                  Tous les membres sont déjà sur ce créneau.
                                </div>
                              ) : (
                                candidates.map((m) => (
                                  <DropdownMenuItem
                                    key={m.employee_id}
                                    onSelect={() =>
                                      setEditing({
                                        employeeId: m.employee_id,
                                        employeeName: m.full_name,
                                        date: dISO,
                                        defaults: {
                                          start_time: n.start_time.slice(0, 5),
                                          end_time: n.end_time.slice(0, 5),
                                          position: n.role,
                                        },
                                      })
                                    }
                                  >
                                    <span className="font-bold text-sm truncate">{m.full_name}</span>
                                  </DropdownMenuItem>
                                ))
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    );
                  })}
                  {/* Bouton générique + ajouter shift libre dans le jour */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-[10px] text-ink-3 hover:text-gold-dark py-1.5 min-h-[36px] rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Nouveau shift
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                      <DropdownMenuLabel>Membres du site</DropdownMenuLabel>
                      {members.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-ink-3 italic">
                          Aucun membre sur ce site.
                        </div>
                      ) : (
                        members.map((m) => (
                          <DropdownMenuItem
                            key={m.employee_id}
                            onSelect={() =>
                              setEditing({
                                employeeId: m.employee_id,
                                employeeName: m.full_name,
                                date: dISO,
                              })
                            }
                          >
                            <span className="font-bold text-sm truncate">{m.full_name}</span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </Card>
          );
        })}
        </div>
      </div>

      {editing ? (
        <ShiftDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          employeeId={editing.employeeId}
          employeeName={editing.employeeName}
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
                  site_id: editing.shift.site_id,
                  notes: editing.shift.notes,
                }
              : undefined
          }
          defaults={
            !editing.shift && editing.defaults
              ? {
                  start_time: editing.defaults.start_time,
                  end_time: editing.defaults.end_time,
                  break_minutes: 30,
                  position: editing.defaults.position,
                  site_id: site.id,
                }
              : !editing.shift
                ? { site_id: site.id }
                : undefined
          }
          sites={sitesForDialog}
          preferredSiteIds={preferredSiteIds}
        />
      ) : null}
    </>
  );
}
