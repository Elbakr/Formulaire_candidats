// Interface mobile "Quick availability" : Karim ouvre cette page sur son iPhone
// face a un employe, search son nom, regle conge/dispos en quelques tap. Karim
// 20/05 : simplicite + tactile + reactivite.

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuickAvailabilityClient } from "./quick-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuickAvailabilityPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);
  const horizonISO = horizon.toISOString().slice(0, 10);

  const [
    { data: empsRaw },
    { data: unavailsRaw },
    { data: leavesRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title, status")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("employee_unavailabilities")
      .select("id, employee_id, day_of_week, date_specific, start_time, end_time, reason, is_active")
      .or(`date_specific.is.null,and(date_specific.gte.${todayISO},date_specific.lte.${horizonISO})`),
    supabase
      .from("time_off_requests")
      .select("id, employee_id, kind, start_date, end_date, status, reason")
      .gte("end_date", todayISO)
      .in("status", ["approved", "pending"]),
  ]);

  return (
    <QuickAvailabilityClient
      employees={(empsRaw ?? []) as Array<{ id: string; full_name: string; job_title: string | null }>}
      unavails={(unavailsRaw ?? []) as Array<{
        id: string;
        employee_id: string;
        day_of_week: number | null;
        date_specific: string | null;
        start_time: string;
        end_time: string;
        reason: string | null;
        is_active: boolean;
      }>}
      leaves={(leavesRaw ?? []) as Array<{
        id: string;
        employee_id: string;
        kind: string;
        start_date: string;
        end_date: string;
        status: string;
        reason: string | null;
      }>}
      todayISO={todayISO}
    />
  );
}
