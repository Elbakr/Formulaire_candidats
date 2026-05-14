import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  parseISODate,
  addDays,
  toISODate,
  weekRange,
} from "@/lib/planning";
import { AllSitesBoard, type AllSitesShift, type AllSitesSite, type SiteDayNeedRow } from "./board";

export default async function AllSitesPage(props: {
  searchParams: Promise<{ week?: string; filter?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { week, filter } = await props.searchParams;

  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const supabase = await createClient();
  const [{ data: sitesRaw }, { data: shiftsRaw }, { data: needsRaw }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, color, light_color, abbr")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("shifts")
      .select(
        `id, employee_id, date, start_time, end_time, position, location, site_id, is_overtime, overtime_multiplier,
         employee:employees(id, full_name, job_title)`,
      )
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, start_time, end_time, headcount, role, is_critical, is_enabled")
      .eq("is_enabled", true),
  ]);

  const allSites = (sitesRaw ?? []) as AllSitesSite[];
  const shifts = (shiftsRaw ?? []) as unknown as AllSitesShift[];
  const needs = (needsRaw ?? []) as SiteDayNeedRow[];

  // Karim 14/05/2026 : ne montrer que les sites pour lesquels le planning a
  // ete genere cette semaine (proxy : sites qui ont >=1 shift sur la fenetre).
  // Les sites sans shift cette semaine sont caches pour eviter le bruit visuel.
  const sitesWithShifts = new Set(
    shifts.map((s) => s.site_id).filter((v): v is string => Boolean(v)),
  );
  const sites = allSites.filter((s) => sitesWithShifts.has(s.id));

  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const todayWeek = toISODate(startOfWeek(new Date()));

  const filterValue = (filter ?? "all").toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Vue d'ensemble — magasins</h1>
          <p className="text-sm text-ink-2">
            Du {monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au{" "}
            {addDays(monday, 6).toLocaleDateString("fr-BE", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-1 items-center flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${prevWeek}${filterValue !== "all" ? `&filter=${filterValue}` : ""}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${todayWeek}${filterValue !== "all" ? `&filter=${filterValue}` : ""}`}>
              Cette semaine
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${nextWeek}${filterValue !== "all" ? `&filter=${filterValue}` : ""}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <AllSitesBoard
        mondayISO={toISODate(monday)}
        sites={sites}
        shifts={shifts}
        needs={needs}
        initialFilter={filterValue}
      />
    </div>
  );
}
