import { Calendar } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { startOfWeek, weekRange, toISODate } from "@/lib/planning";
import { MyPlanningClient } from "./client";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyPlanningPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, job_title, weekly_hours, status, department:departments(name)")
    .eq("profile_id", user.id)
    .maybeSingle();

  const employee = emp as unknown as {
    id: string;
    full_name: string;
    job_title: string | null;
    weekly_hours: number | null;
    status: string;
    department: { name: string } | null;
  } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("planning.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <Calendar className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("planning.no_employee", locale)}</p>
            <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">{t("planning.no_employee_hint", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date();
  const todayISO = toISODate(today);
  const monday = startOfWeek(today);
  const { start: weekStart, end: weekEnd } = weekRange(monday);

  const [{ data: upcoming }, { data: weekShifts }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, position, location, notes, site:sites(code, name, color)")
      .eq("employee_id", employee.id)
      .eq("is_overtime", false)
      .gte("date", todayISO)
      .order("date", { ascending: true })
      .limit(50),
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, position, location, notes, site:sites(code, name, color)")
      .eq("employee_id", employee.id)
      .eq("is_overtime", false)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date")
      .order("start_time"),
  ]);

  return (
    <MyPlanningClient
      employee={{
        id: employee.id,
        full_name: employee.full_name,
        job_title: employee.job_title,
        weekly_hours: employee.weekly_hours,
        department_name: employee.department?.name ?? null,
      }}
      mondayISO={toISODate(monday)}
      upcoming={(upcoming ?? []) as never}
      weekShifts={(weekShifts ?? []) as never}
      locale={locale}
    />
  );
}
