import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startOfWeek, parseISODate, weekRange, toISODate, addDays } from "@/lib/planning";
import { AgendaGrid } from "./agenda-grid";

export default async function AgendaPage(props: { searchParams: Promise<{ week?: string }> }) {
  await requireRole(["admin", "rh"]);
  const { week } = await props.searchParams;
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  // Bound: week start at 00:00 -> end at 23:59:59 of Sunday
  const startISO = new Date(monday);
  startISO.setHours(0, 0, 0, 0);
  const endISO = addDays(monday, 7);
  endISO.setHours(0, 0, 0, 0);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interviews")
    .select(
      `id, scheduled_at, duration_min, type, status, location, meeting_url, notes,
       application:applications(
         id,
         candidate:candidates(id, full_name, email)
       ),
       interviewer_profile:profiles!interviews_interviewer_fkey(id, full_name)`,
    )
    .gte("scheduled_at", startISO.toISOString())
    .lt("scheduled_at", endISO.toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("agenda fetch:", error.message);
  }

  return (
    <AgendaGrid
      mondayISO={toISODate(monday)}
      weekStartISO={start}
      weekEndISO={end}
      interviews={(data ?? []) as never}
    />
  );
}
