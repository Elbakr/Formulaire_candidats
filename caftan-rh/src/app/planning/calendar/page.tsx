import { startOfWeek, toISODate, weekRange, parseISODate } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import { WeeklyPlanningBoard } from "./weekly-board";

export default async function PlanningCalendarPage(
  props: { searchParams: Promise<{ week?: string }> },
) {
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const todayISO = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [
    { data: emps },
    { data: shifts },
    { data: timeOff },
    { data: holidays },
    { data: closures },
    { data: sites },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title, weekly_hours, department_id, department:departments(name)")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("shifts")
      .select("*")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("id, employee_id, kind, start_date, end_date, status")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    // Jours fériés actifs sur la semaine — utilisés pour afficher un badge sur
    // les cellules concernées dans le board.
    supabase
      .from("holidays")
      .select("id, date, label, kind, priority, tradition")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    // Fermetures boutique chevauchant la semaine — filtrage par département
    // côté client (selon l'employé). On charge tout puisque ça reste petit.
    supabase
      .from("company_closures")
      .select("id, label, start_date, end_date, department_id, reason")
      .lte("start_date", end)
      .gte("end_date", start)
      .order("start_date"),
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("site_assignments")
      .select("employee_id, site_id, is_primary")
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`),
  ]);

  // Map empId → siteIds (préférés en tête : is_primary first)
  const assignsByEmp = new Map<string, string[]>();
  for (const a of (assignments ?? []) as Array<{
    employee_id: string;
    site_id: string;
    is_primary: boolean;
  }>) {
    const arr = assignsByEmp.get(a.employee_id) ?? [];
    if (a.is_primary) arr.unshift(a.site_id);
    else arr.push(a.site_id);
    assignsByEmp.set(a.employee_id, arr);
  }
  const employeesWithSites = ((emps ?? []) as Array<{ id: string }>).map((e) => ({
    ...e,
    preferred_site_ids: assignsByEmp.get(e.id) ?? [],
  }));

  return (
    <WeeklyPlanningBoard
      mondayISO={toISODate(monday)}
      employees={employeesWithSites as never}
      shifts={(shifts ?? []) as never}
      timeOff={(timeOff ?? []) as never}
      holidays={(holidays ?? []) as never}
      closures={(closures ?? []) as never}
      sites={(sites ?? []) as never}
    />
  );
}
