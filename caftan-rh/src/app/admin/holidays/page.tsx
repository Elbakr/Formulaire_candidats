import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HolidaysAdmin } from "./holidays-admin";

export default async function AdminHolidaysPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const currentYear = new Date().getFullYear();
  // On charge sur 3 ans (N-1 → N+1) pour avoir un historique utilisable
  // dans la calendrier visualization, sans charger 100 ans inutilement.
  const yearStart = `${currentYear - 1}-01-01`;
  const yearEnd = `${currentYear + 1}-12-31`;

  const [
    { data: holidays },
    { data: schoolBreaks },
    { data: closures },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from("holidays")
      .select("id, date, label, kind, country, region, recurring_yearly, is_active, notes")
      .gte("date", yearStart)
      .lte("date", yearEnd)
      .order("date"),
    supabase
      .from("school_breaks")
      .select("id, label, start_date, end_date, region")
      .gte("end_date", yearStart)
      .lte("start_date", yearEnd)
      .order("start_date"),
    supabase
      .from("company_closures")
      .select("id, label, start_date, end_date, department_id, reason, created_at")
      .gte("end_date", yearStart)
      .lte("start_date", yearEnd)
      .order("start_date"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <HolidaysAdmin
      currentYear={currentYear}
      holidays={(holidays ?? []) as never}
      schoolBreaks={(schoolBreaks ?? []) as never}
      closures={(closures ?? []) as never}
      departments={(departments ?? []) as never}
    />
  );
}
