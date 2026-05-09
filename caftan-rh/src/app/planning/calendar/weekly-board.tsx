"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { useRealtime } from "@/hooks/use-realtime";
import { addDays, parseISODate, toISODate, DAY_LABELS, shiftHours } from "@/lib/planning";
import { ShiftDialog } from "./shift-dialog";
import { GenerateWeekButton } from "./generate-button";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  weekly_hours: number | null;
  department: { name: string } | null;
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
  notes: string | null;
};

type TimeOff = {
  id: string;
  employee_id: string;
  kind: string;
  start_date: string;
  end_date: string;
};

export function WeeklyPlanningBoard({
  mondayISO,
  employees,
  shifts,
  timeOff,
}: {
  mondayISO: string;
  employees: Employee[];
  shifts: Shift[];
  timeOff: TimeOff[];
}) {
  const router = useRouter();
  const monday = parseISODate(mondayISO);
  const [editing, setEditing] = useState<{ employeeId: string; date: string; shift?: Shift } | null>(null);

  useRealtime("shifts", () => router.refresh());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [mondayISO]);

  function shiftsFor(empId: string, dateISO: string) {
    return shifts.filter((s) => s.employee_id === empId && s.date === dateISO);
  }

  function isOff(empId: string, dateISO: string) {
    return timeOff.some(
      (t) => t.employee_id === empId && dateISO >= t.start_date && dateISO <= t.end_date,
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
                  {days.map((d, i) => (
                    <th key={i} className="text-center px-2 py-2 min-w-[120px] border-l border-line">
                      <div className="font-bold uppercase tracking-wider text-[10px] text-ink-3">{DAY_LABELS[i]}</div>
                      <div className="font-bold text-sm">{d.getDate()}</div>
                    </th>
                  ))}
                  <th className="text-center px-2 py-2 border-l border-line w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const total = totalHours(e.id);
                  const target = e.weekly_hours ?? 38;
                  return (
                    <tr key={e.id} className="border-t border-line">
                      <td className="px-3 py-2 sticky left-0 bg-surface z-[1] border-r border-line">
                        <div className="flex items-center gap-2">
                          <NameAvatar name={e.full_name} className="h-7 w-7 text-[10px]" />
                          <div className="min-w-0">
                            <div className="font-bold truncate">{e.full_name}</div>
                            <div className="text-[10px] text-ink-3 truncate">{e.job_title}</div>
                          </div>
                        </div>
                      </td>
                      {days.map((d, i) => {
                        const dateISO = toISODate(d);
                        const dayShifts = shiftsFor(e.id, dateISO);
                        const off = isOff(e.id, dateISO);
                        return (
                          <td
                            key={i}
                            className={`p-1 align-top border-l border-line min-h-[64px] ${off ? "bg-violet-light" : ""}`}
                          >
                            {off ? (
                              <div className="text-[10px] uppercase font-bold text-violet text-center py-3">Congé</div>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  {dayShifts.map((s) => (
                                    <button
                                      key={s.id}
                                      onClick={() => setEditing({ employeeId: e.id, date: dateISO, shift: s })}
                                      className="w-full text-left bg-gold-light text-gold-dark rounded px-1.5 py-1 hover:bg-gold hover:text-white transition-colors"
                                    >
                                      <div className="font-bold">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</div>
                                      {s.position ? <div className="text-[10px] truncate">{s.position}</div> : null}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setEditing({ employeeId: e.id, date: dateISO })}
                                  className="w-full mt-0.5 text-[10px] text-ink-3 hover:text-gold-dark py-1 rounded border border-dashed border-line hover:border-gold transition-colors flex items-center justify-center gap-0.5"
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
        />
      ) : null}
    </div>
  );
}
