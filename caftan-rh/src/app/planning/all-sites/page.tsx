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
} from "@/lib/planning";
import { AllSitesBoard, type AllSitesShift, type AllSitesSite, type SiteDayNeedRow } from "./board";
import { ClearPlanningMenu } from "@/app/planning/calendar/clear-planning-menu";
import { SiteCoverageStrip } from "@/app/planning/calendar/site-coverage-strip";

// Karim 19/05 : force-dynamic pour eviter incoherence cache vs Planning
// individuel (les 2 vues doivent toujours afficher les memes shifts).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_WEEKS = new Set(["1", "2", "4", "12"]);

export default async function AllSitesPage(props: {
  searchParams: Promise<{ week?: string; filter?: string; weeks?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { week, filter, weeks } = await props.searchParams;

  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const nbWeeks = VALID_WEEKS.has(weeks ?? "") ? Number(weeks) : 1;
  const periodStart = toISODate(monday);
  const periodEnd = toISODate(addDays(monday, nbWeeks * 7 - 1));

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
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date")
      .order("start_time"),
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, start_time, end_time, headcount, role, is_critical, is_enabled")
      .eq("is_enabled", true),
  ]);

  const allSites = (sitesRaw ?? []) as AllSitesSite[];
  const allShifts = (shiftsRaw ?? []) as unknown as AllSitesShift[];
  const needs = (needsRaw ?? []) as SiteDayNeedRow[];

  // Decoupe par semaine. Pour chaque semaine on filtre les shifts et les sites
  // affiches a ceux qui ont >=1 shift dans cette semaine (Karim 14/05).
  const weekBlocks = Array.from({ length: nbWeeks }, (_, i) => {
    const wMonday = addDays(monday, i * 7);
    const wStart = toISODate(wMonday);
    const wEnd = toISODate(addDays(wMonday, 6));
    const weekShifts = allShifts.filter((s) => s.date >= wStart && s.date <= wEnd);
    // Karim 20/05 : revenir au filtrage 'sites avec >=1 shift cette semaine'.
    // Combiner avec is_active=false sur sites Anvers (C, F) -> seuls les sites
    // Bruxelles utilises apparaissent. La coherence avec Planning individuel
    // est gardee car C/F n ont pas de shifts non plus.
    const sitesWithShifts = new Set(
      weekShifts.map((s) => s.site_id).filter((v): v is string => Boolean(v)),
    );
    const sites = allSites.filter((s) => sitesWithShifts.has(s.id));
    return { mondayISO: wStart, endISO: wEnd, sites, shifts: weekShifts };
  });

  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const todayWeek = toISODate(startOfWeek(new Date()));

  const filterValue = (filter ?? "all").toLowerCase();
  const filterQuery = filterValue !== "all" ? `&filter=${filterValue}` : "";
  const weeksQuery = nbWeeks !== 1 ? `&weeks=${nbWeeks}` : "";

  const PERIOD_OPTIONS = [
    { value: 1, label: "1 sem" },
    { value: 2, label: "2 sem" },
    { value: 4, label: "4 sem" },
    { value: 12, label: "12 sem" },
  ];

  const dateLabel =
    nbWeeks === 1
      ? `Du ${monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au ${addDays(monday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}`
      : `${nbWeeks} semaines : du ${monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })} au ${addDays(monday, nbWeeks * 7 - 1).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Vue d'ensemble — magasins</h1>
          <p className="text-sm text-ink-2">{dateLabel}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Selecteur periode (1/2/4/12 sem) -- Karim 15/05 : vue temporelle. */}
          <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface text-xs">
            {PERIOD_OPTIONS.map((o) => {
              const isCurrent = nbWeeks === o.value;
              const wq = o.value !== 1 ? `&weeks=${o.value}` : "";
              return (
                <Link
                  key={o.value}
                  href={`?week=${toISODate(monday)}${wq}${filterQuery}`}
                  className={`whitespace-nowrap px-3 py-1.5 font-bold transition-colors ${
                    isCurrent
                      ? "bg-gold text-[#1a1a0d]"
                      : "bg-white text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${prevWeek}${weeksQuery}${filterQuery}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${todayWeek}${weeksQuery}${filterQuery}`}>
              Cette semaine
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${nextWeek}${weeksQuery}${filterQuery}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <ClearPlanningMenu />
        </div>
      </div>

      <SiteCoverageStrip weekISO={toISODate(monday)} />

      {weekBlocks.map((wb, idx) => {
        const wMonday = parseISODate(wb.mondayISO);
        const isCurrentWeek = wb.mondayISO === todayWeek;
        return (
          <div key={wb.mondayISO} className="space-y-2">
            {nbWeeks > 1 ? (
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded-md border ${
                  isCurrentWeek
                    ? "border-gold bg-gold-light/30"
                    : "border-line bg-surface-2/30"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                  Semaine {idx + 1} / {nbWeeks}
                </span>
                <span className="text-xs text-ink-2">
                  {wMonday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                  {" → "}
                  {addDays(wMonday, 6).toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                </span>
                {isCurrentWeek ? (
                  <span className="ml-auto text-[10px] font-bold uppercase text-gold-dark">
                    Cette semaine
                  </span>
                ) : null}
                <Link
                  href={`?week=${wb.mondayISO}${filterQuery}`}
                  className="ml-auto text-[10px] text-ink-3 hover:text-gold-dark hover:underline font-bold uppercase tracking-wider"
                  title="Zoomer sur cette semaine"
                >
                  Zoom →
                </Link>
              </div>
            ) : null}
            <AllSitesBoard
              mondayISO={wb.mondayISO}
              sites={wb.sites}
              shifts={wb.shifts}
              needs={needs}
              initialFilter={filterValue}
            />
          </div>
        );
      })}
    </div>
  );
}
