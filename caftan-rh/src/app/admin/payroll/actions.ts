"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

type Args = { year: number; month: number; departmentId: string | null };
type Result = {
  csv?: string;
  filename?: string;
  employee_count?: number;
  total_hours?: number;
  error?: string;
};

type ShiftRow = {
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: string;
  employee: {
    id: string;
    full_name: string;
    email: string;
    contract_type: string | null;
    weekly_hours: number | null;
    department: { name: string | null } | null;
  } | null;
};

function startEndOfMonth(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + (m || 0);
}

// Returns { worked_hours, weekend_hours, night_hours } for a single shift
function classifyShift(s: ShiftRow) {
  const startMin = timeToMin(s.start_time);
  const endMin = timeToMin(s.end_time);
  const grossMin = endMin - startMin;
  const workedMin = Math.max(0, grossMin - (s.break_minutes || 0));
  const workedHours = workedMin / 60;
  const dow = new Date(s.date).getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  // Night band 22:00-06:00
  let nightMin = 0;
  for (let m = startMin; m < endMin; m++) {
    const minOfDay = ((m % 1440) + 1440) % 1440;
    if (minOfDay >= 22 * 60 || minOfDay < 6 * 60) nightMin += 1;
  }
  // Subtract proportional break from night/weekend
  const breakRatio = (s.break_minutes || 0) / Math.max(1, grossMin);
  const nightHours = (nightMin / 60) * (1 - breakRatio);
  const weekendHours = isWeekend ? workedHours : 0;
  return {
    worked_hours: workedHours,
    weekend_hours: weekendHours,
    weekday_hours: workedHours - weekendHours,
    night_hours: nightHours,
  };
}

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportPayrollAction(args: Args): Promise<Result> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.year || !args.month) return { error: "Année/mois requis." };

  const supabase = await createClient();
  const { start, end } = startEndOfMonth(args.year, args.month);

  let q = supabase
    .from("shifts")
    .select(
      `date, start_time, end_time, break_minutes, status,
       employee:employees(id, full_name, email, contract_type, weekly_hours,
                          department:departments(name), department_id)`,
    )
    .eq("status", "done")
    .gte("date", start)
    .lte("date", end);

  const { data: rawShifts, error } = await q;
  if (error) return { error: error.message };
  let shifts = (rawShifts ?? []) as unknown as ShiftRow[];
  if (args.departmentId) {
    shifts = shifts.filter((s) => {
      const d = s.employee?.department as unknown as { name?: string } | null;
      return !!d && (s.employee as unknown as { department_id?: string })?.department_id === args.departmentId;
    });
  }

  // Aggregate by employee
  type Agg = {
    id: string;
    full_name: string;
    email: string;
    contract_type: string;
    weekly_hours: number;
    department: string;
    total_hours: number;
    weekday_hours: number;
    weekend_hours: number;
    night_hours: number;
    shift_count: number;
  };
  const byEmp = new Map<string, Agg>();

  for (const s of shifts) {
    if (!s.employee) continue;
    const emp = s.employee;
    const cls = classifyShift(s);
    const key = emp.id;
    const cur = byEmp.get(key) ?? {
      id: emp.id,
      full_name: emp.full_name,
      email: emp.email,
      contract_type: emp.contract_type ?? "",
      weekly_hours: emp.weekly_hours ?? 0,
      department: emp.department?.name ?? "",
      total_hours: 0,
      weekday_hours: 0,
      weekend_hours: 0,
      night_hours: 0,
      shift_count: 0,
    };
    cur.total_hours += cls.worked_hours;
    cur.weekday_hours += cls.weekday_hours;
    cur.weekend_hours += cls.weekend_hours;
    cur.night_hours += cls.night_hours;
    cur.shift_count += 1;
    byEmp.set(key, cur);
  }

  // Time-off days approved this month
  const { data: timeOff } = await supabase
    .from("time_off_requests")
    .select("employee_id, start_date, end_date")
    .eq("status", "approved")
    .lte("start_date", end)
    .gte("end_date", start);

  const offByEmp = new Map<string, number>();
  for (const t of (timeOff ?? []) as { employee_id: string; start_date: string; end_date: string }[]) {
    const sStart = t.start_date < start ? start : t.start_date;
    const sEnd = t.end_date > end ? end : t.end_date;
    const days = Math.round(
      (new Date(sEnd).getTime() - new Date(sStart).getTime()) / 86_400_000
    ) + 1;
    offByEmp.set(t.employee_id, (offByEmp.get(t.employee_id) ?? 0) + Math.max(0, days));
  }

  // CSV
  const header = [
    "employee_id", "full_name", "email", "contract_type", "weekly_hours",
    "department", "period_start", "period_end",
    "total_hours", "weekday_hours", "weekend_hours", "night_hours",
    "shift_count", "time_off_days_in_period",
  ];
  const rows: string[] = [header.join(",")];
  let totalHours = 0;
  for (const a of byEmp.values()) {
    totalHours += a.total_hours;
    rows.push([
      a.id, a.full_name, a.email, a.contract_type, a.weekly_hours,
      a.department, start, end,
      a.total_hours.toFixed(2),
      a.weekday_hours.toFixed(2),
      a.weekend_hours.toFixed(2),
      a.night_hours.toFixed(2),
      a.shift_count,
      offByEmp.get(a.id) ?? 0,
    ].map(csvEscape).join(","));
  }
  const csv = rows.join("\n");

  // Audit log
  await supabase.from("pay_periods_exported").upsert({
    year: args.year,
    month: args.month,
    department_id: args.departmentId,
    exported_by: profile.id,
    employee_count: byEmp.size,
    total_hours: totalHours,
    exported_at: new Date().toISOString(),
  }, { onConflict: "year,month,department_id" });

  revalidatePath("/admin/payroll");

  const filename = `paie-${args.year}-${String(args.month).padStart(2, "0")}.csv`;
  return {
    csv,
    filename,
    employee_count: byEmp.size,
    total_hours: totalHours,
  };
}
