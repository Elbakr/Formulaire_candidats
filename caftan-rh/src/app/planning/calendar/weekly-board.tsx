"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, CalendarOff, Printer, LifeBuoy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRealtime } from "@/hooks/use-realtime";
import { addDays, parseISODate, toISODate, DAY_LABELS, shiftHours } from "@/lib/planning";
import { moveShiftAction } from "@/app/planning/actions";
import { toast } from "sonner";
import { ShiftDialog } from "./shift-dialog";
import { GenerateWeekButton } from "./generate-button";
import { BroadcastScheduleButton } from "./broadcast-button";
import { BulkActionsMenu } from "./bulk-actions-menu";
import { ClearWeekButton } from "./clear-week-button";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  weekly_hours: number | null;
  department_id: string | null;
  department: { name: string } | null;
  preferred_site_ids?: string[];
};

type SiteOption = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

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
};

type TimeOff = {
  id: string;
  employee_id: string;
  kind: string;
  start_date: string;
  end_date: string;
};

type Holiday = {
  id: string;
  date: string;
  label: string;
  kind:
    | "legal"
    | "school_break"
    | "company_closure"
    | "event_other"
    | "religious"
    | "international";
  priority?: number | null;
  tradition?: string | null;
};

type Closure = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  department_id: string | null;
  reason: string | null;
};

export function WeeklyPlanningBoard({
  mondayISO,
  employees,
  shifts,
  timeOff,
  holidays = [],
  closures = [],
  sites = [],
}: {
  mondayISO: string;
  employees: Employee[];
  shifts: Shift[];
  timeOff: TimeOff[];
  holidays?: Holiday[];
  closures?: Closure[];
  sites?: SiteOption[];
}) {
  const router = useRouter();
  const monday = parseISODate(mondayISO);
  const [editing, setEditing] = useState<{ employeeId: string; date: string; shift?: Shift } | null>(null);
  // Drag & drop : id du shift en cours de drag, pour styler la cible
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);

  useRealtime("shifts", () => router.refresh());

  function onDropShift(shiftId: string, toEmpId: string, toDate: string) {
    setDraggingId(null);
    setDropHover(null);
    (async () => {
      const r = await moveShiftAction({ shiftId, toEmployeeId: toEmpId, toDate });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Shift déplacé.");
        router.refresh();
      }
    })();
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [mondayISO]);
  const siteById = useMemo(() => {
    const m = new Map<string, SiteOption>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  function shiftsFor(empId: string, dateISO: string) {
    return shifts.filter((s) => s.employee_id === empId && s.date === dateISO);
  }

  function isOff(empId: string, dateISO: string) {
    return timeOff.some(
      (t) => t.employee_id === empId && dateISO >= t.start_date && dateISO <= t.end_date,
    );
  }

  // Lookup O(1) des fériés par date — on indexe en groupes pour pouvoir
  // afficher plusieurs fériés simultanés (ex. Aïd al-Fitr + journée des
  // femmes le même jour).
  const holidaysByDate = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const arr = m.get(h.date) ?? [];
      arr.push(h);
      m.set(h.date, arr);
    }
    // Tri par priorité décroissante : la plus marquante en premier.
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }
    return m;
  }, [holidays]);

  function holidaysFor(dateISO: string): Holiday[] {
    return holidaysByDate.get(dateISO) ?? [];
  }
  function topHolidayFor(dateISO: string): Holiday | null {
    return holidaysFor(dateISO)[0] ?? null;
  }

  function holidayClasses(h: Holiday): {
    badge: string;
    cellBg: string;
    dot: string;
  } {
    // legal BE → rouge ; islamic → emeraude ; jewish → indigo ; hindu → orange ;
    // christian non-légal → cyan ; international civil → bleu.
    if (h.kind === "legal") {
      return {
        badge: "bg-danger-light text-danger",
        cellBg: "bg-danger-light/40",
        dot: "bg-danger",
      };
    }
    if (h.kind === "religious") {
      if (h.tradition === "islamic") {
        return {
          badge: "bg-emerald-100 text-emerald-800",
          cellBg: "bg-emerald-50",
          dot: "bg-emerald-600",
        };
      }
      if (h.tradition === "jewish") {
        return {
          badge: "bg-indigo-100 text-indigo-800",
          cellBg: "bg-indigo-50",
          dot: "bg-indigo-600",
        };
      }
      if (h.tradition === "hindu") {
        return {
          badge: "bg-orange-100 text-orange-800",
          cellBg: "bg-orange-50",
          dot: "bg-orange-600",
        };
      }
      return {
        badge: "bg-cyan-100 text-cyan-800",
        cellBg: "bg-cyan-50",
        dot: "bg-cyan-600",
      };
    }
    if (h.kind === "international") {
      return {
        badge: "bg-sky-100 text-sky-800",
        cellBg: "bg-sky-50",
        dot: "bg-sky-600",
      };
    }
    return {
      badge: "bg-surface-2 text-ink-2",
      cellBg: "",
      dot: "bg-ink-3",
    };
  }

  // Une fermeture concerne une cellule si la date est dans la plage et que
  // l'employé est dans le département ciblé (ou si la fermeture est globale).
  function closureFor(dateISO: string, departmentId: string | null): Closure | null {
    return (
      closures.find(
        (c) =>
          dateISO >= c.start_date &&
          dateISO <= c.end_date &&
          (c.department_id === null || c.department_id === departmentId),
      ) ?? null
    );
  }

  function totalHours(empId: string) {
    return shifts
      .filter((s) => s.employee_id === empId)
      .reduce((acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  }

  const prev = toISODate(addDays(monday, -7));
  const next = toISODate(addDays(monday, 7));
  const todayWeek = toISODate(addDays(parseISODate(toISODate(new Date())), -((new Date().getDay() || 7) - 1)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Planning semaine</h1>
          <p className="text-sm text-ink-2">
            Du {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au {addDays(monday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="ml-auto flex gap-1 items-center flex-wrap">
          <GenerateWeekButton weekISO={mondayISO} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/planning/reinforcement?date=${mondayISO}`}>
              <LifeBuoy className="h-3.5 w-3.5" /> Demande de renfort
            </Link>
          </Button>
          <ClearWeekButton weekISO={mondayISO} />
          <BulkActionsMenu weekISO={mondayISO} />
          <BroadcastScheduleButton weekISO={mondayISO} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Printer className="h-3.5 w-3.5" /> Imprimer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/planning/print?week=${mondayISO}&period=week`} target="_blank">
                  Cette semaine
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/planning/print?week=${mondayISO}&period=3weeks`} target="_blank">
                  3 semaines
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/planning/print?week=${mondayISO}&period=month`} target="_blank">
                  Mois (4 semaines)
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="w-2" />
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${prev}`}><ChevronLeft className="h-3.5 w-3.5" /></Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${todayWeek}`}>Cette semaine</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${next}`}><ChevronRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>

      <Card>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun employé actif. Va dans <Link href="/planning/employees" className="text-gold-dark font-bold hover:underline">Employés</Link> pour en ajouter, ou embauche des candidats (status "Embauché" sur leur fiche).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-left px-3 py-2 sticky left-0 bg-surface-2 z-[1] min-w-[180px]">Employé</th>
                  {days.map((d, i) => {
                    const dISO = toISODate(d);
                    const dayHols = holidaysFor(dISO);
                    return (
                      <th key={i} className="text-center px-2 py-2 min-w-[120px] border-l border-line">
                        <div className="font-bold uppercase tracking-wider text-[10px] text-ink-3">{DAY_LABELS[i]}</div>
                        <div className="font-bold text-sm">{d.getDate()}</div>
                        {dayHols.map((hol) => {
                          const cls = holidayClasses(hol);
                          const isCritical = (hol.priority ?? 0) >= 3;
                          return (
                            <div
                              key={hol.id}
                              className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-bold tracking-wide ${cls.badge} ${
                                isCritical ? "ring-1 ring-current" : ""
                              }`}
                              title={`${hol.kind === "religious" ? "Fête religieuse" : hol.kind === "international" ? "Journée internationale" : "Jour férié"} — ${hol.label}`}
                            >
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                              <span className="truncate max-w-[110px]">{hol.label}</span>
                            </div>
                          );
                        })}
                      </th>
                    );
                  })}
                  <th className="text-center px-2 py-2 border-l border-line w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const total = totalHours(e.id);
                  const target = e.weekly_hours ?? 38;
                  return (
                    <tr key={e.id} id={`emp-${e.id}`} className="border-t border-line">
                      <td className="px-3 py-2 sticky left-0 bg-surface z-[1] border-r border-line">
                        <EmployeeQuickLink
                          employeeId={e.id}
                          fullName={e.full_name}
                          subtitle={e.job_title ?? undefined}
                          variant="block"
                          withAvatar
                          fullWidth
                        />
                      </td>
                      {days.map((d, i) => {
                        const dateISO = toISODate(d);
                        const dayShifts = shiftsFor(e.id, dateISO);
                        const off = isOff(e.id, dateISO);
                        const hol = topHolidayFor(dateISO);
                        const cl = closureFor(dateISO, e.department_id);
                        const holCls = hol ? holidayClasses(hol) : null;
                        const cellBg = off
                          ? "bg-violet-light"
                          : holCls
                            ? holCls.cellBg
                            : cl
                              ? "bg-gold-light/50"
                              : "";
                        const cellKey = `${e.id}|${dateISO}`;
                        const isDropHover = dropHover === cellKey;
                        return (
                          <td
                            key={i}
                            className={`p-1 align-top border-l border-line min-h-[48px] md:min-h-[64px] transition-colors ${cellBg} ${isDropHover ? "ring-2 ring-gold ring-inset bg-gold-light/40" : ""}`}
                            onDragOver={(ev) => {
                              if (!draggingId) return;
                              ev.preventDefault();
                              setDropHover(cellKey);
                            }}
                            onDragLeave={() => {
                              if (dropHover === cellKey) setDropHover(null);
                            }}
                            onDrop={(ev) => {
                              ev.preventDefault();
                              const id = ev.dataTransfer.getData("text/plain");
                              if (id) onDropShift(id, e.id, dateISO);
                            }}
                          >
                            {off ? (
                              <div className="text-[10px] uppercase font-bold text-violet text-center py-3">Congé</div>
                            ) : (
                              <>
                                {hol && holCls ? (
                                  <div
                                    className={`mb-0.5 inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide w-full ${holCls.badge}`}
                                    title={`${hol.kind === "religious" ? "Fête religieuse" : hol.kind === "international" ? "Journée internationale" : "Férié"} : ${hol.label}`}
                                  >
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${holCls.dot}`} />
                                    <span className="truncate">
                                      {hol.kind === "religious"
                                        ? hol.tradition === "islamic"
                                          ? "Fête"
                                          : "Fête rel."
                                        : hol.kind === "international"
                                          ? "Intl"
                                          : "Férié"}
                                    </span>
                                  </div>
                                ) : null}
                                {cl ? (
                                  <div
                                    className="mb-0.5 inline-flex items-center gap-1 rounded bg-gold-light text-gold-dark px-1 py-px text-[9px] font-bold uppercase tracking-wide w-full"
                                    title={`Fermeture : ${cl.label}${cl.reason ? ` — ${cl.reason}` : ""}`}
                                  >
                                    <CalendarOff className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">Fermé</span>
                                  </div>
                                ) : null}
                                <div className="space-y-1">
                                  {dayShifts.map((s) => {
                                    const site = s.site_id ? siteById.get(s.site_id) : null;
                                    return (
                                    <button
                                      key={s.id}
                                      onClick={() => setEditing({ employeeId: e.id, date: dateISO, shift: s })}
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
                                      className={`relative w-full text-left rounded px-1.5 py-2 md:py-1 min-h-[44px] md:min-h-0 transition-colors cursor-grab active:cursor-grabbing ${
                                        draggingId === s.id ? "opacity-40" : ""
                                      } ${
                                        s.is_overtime
                                          ? "bg-orange-100 text-orange-800 border border-dashed border-orange-400 hover:bg-orange-200"
                                          : "bg-gold-light text-gold-dark hover:bg-gold hover:text-white"
                                      }`}
                                      style={site?.color ? { boxShadow: `inset 3px 0 0 ${site.color}` } : undefined}
                                      title={`${site ? `${site.name} (${site.code})` : "Aucun site"}${s.is_overtime ? ` — Heures sup.${s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}` : ""} — glisser-déposer pour déplacer`}
                                    >
                                      <div className="font-bold flex items-center gap-1">
                                        <span>{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                                        {site ? (
                                          <span
                                            className="ml-auto text-[9px] font-bold tracking-wider px-1 py-px rounded text-white"
                                            style={{ backgroundColor: site.color ?? "#666" }}
                                          >
                                            {site.code}
                                          </span>
                                        ) : null}
                                        {s.is_overtime ? (
                                          <span className={`${site ? "" : "ml-auto"} text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded bg-orange-200 text-orange-700`}>
                                            H. sup
                                          </span>
                                        ) : null}
                                      </div>
                                      {s.position ? <div className="text-[10px] truncate">{s.position}</div> : null}
                                    </button>
                                    );
                                  })}
                                </div>
                                <button
                                  onClick={() => setEditing({ employeeId: e.id, date: dateISO })}
                                  className="w-full mt-0.5 text-[10px] text-ink-3 hover:text-gold-dark py-2 md:py-1 min-h-[40px] md:min-h-0 rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-0.5"
                                >
                                  <Plus className="h-2.5 w-2.5" /> ajouter
                                </button>
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-2 py-2 border-l border-line">
                        <div className={`font-mono font-bold ${total > target ? "text-warn" : total < target ? "text-ink-3" : "text-success"}`}>
                          {total.toFixed(1)}h
                        </div>
                        <div className="text-[10px] text-ink-3">/ {target}h</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <ShiftDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          employeeId={editing.employeeId}
          employeeName={employees.find((e) => e.id === editing.employeeId)?.full_name ?? ""}
          date={editing.date}
          shift={editing.shift}
          sites={sites}
          preferredSiteIds={
            employees.find((e) => e.id === editing.employeeId)?.preferred_site_ids ?? []
          }
        />
      ) : null}
    </div>
  );
}
