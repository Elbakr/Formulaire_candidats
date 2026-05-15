import { createClient } from "@/lib/supabase/server";
import { EmployeeAvailabilityEditor, type UnavailItem } from "./availability-editor";

/**
 * Section "Dispos employe" sur la fiche /planning/employees/[id].
 * Karim 15/05/2026 : passe en EDITION RH/admin (2-way sync avec
 * /me/availability cote employe via la meme table employee_unavailabilities).
 */
export async function EmployeeAvailabilitySection({
  employeeId,
  fixedOffDays,
}: {
  employeeId: string;
  fixedOffDays: number[] | null;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_unavailabilities")
    .select("id, day_of_week, date_specific, start_time, end_time, reason, notes, is_active")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("date_specific", { ascending: true })
    .order("day_of_week", { ascending: true });

  const items = ((data ?? []) as UnavailItem[]);

  return (
    <EmployeeAvailabilityEditor
      employeeId={employeeId}
      fixedOffDays={fixedOffDays ?? []}
      items={items}
    />
  );
}
