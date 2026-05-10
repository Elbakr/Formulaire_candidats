import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeasonalAdmin } from "./seasonal-admin";

export default async function SeasonalPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("seasonal_events")
    .select(
      "id, name, kind, start_date, end_date, staff_multiplier, notes, is_active, created_at",
    )
    .order("start_date", { ascending: true });

  return <SeasonalAdmin events={(events ?? []) as never} />;
}
