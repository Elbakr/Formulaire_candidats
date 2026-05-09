import { startOfWeek, addDays, toISODate, weekRange, parseISODate } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import { WeeklyPlanningBoard } from "./weekly-board";

export default async function PlanningCalendarPage(
  props: { searchParams: Promise<{ week?: string }> },
) {
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const supabase = await createClient();
  const [{ data: emps }, { data: shifts }, { data: timeOff }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title, weekly_hours, department:departments(name)")
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
  ]);

  return (
    <WeeklyPlanningBoard
      mondayISO={toISODate(monday)}
      employees={(emps ?? []) as never}
      shifts={(shifts ?? []) as never}
      timeOff={(timeOff ?? []) as never}
    />
  );
}
