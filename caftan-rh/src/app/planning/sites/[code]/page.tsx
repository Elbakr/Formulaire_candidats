import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Printer, LifeBuoy } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  parseISODate,
  addDays,
  toISODate,
  weekRange,
  shiftHours,
} from "@/lib/planning";
import { loadSiteByCode, loadSiteNeeds, loadSites } from "@/lib/sites";
import { MembersSection } from "./members-section";
import { SitePresenceStrip } from "./presence-strip";
import { GenerateSitePlanButton } from "./generate-button";
import { AutoFillButton } from "./auto-fill-button";
import { ClearWeekButton } from "../../calendar/clear-week-button";
import { ClearPlanningMenu } from "../../calendar/clear-planning-menu";
import { NeedsEditor } from "./needs-editor";
import { SiteWeekBoard } from "./site-week-board";
import { SiteNavigator } from "./site-navigator";
import { SiteIncoherenceBanner } from "./incoherence-banner";
import { loadSiteAnalyticsData } from "@/app/planning/employees/[id]/calendar/site-analytics-loader";
import { loadCurrentlyIn } from "@/lib/clock";

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  site_id: string | null;
  notes: string | null;
  is_overtime?: boolean;
  overtime_multiplier?: number | null;
  employee: { id: string; full_name: string; job_title: string | null } | null;
};

export default async function SiteDetailPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const { code } = await props.params;
  const { week } = await props.searchParams;

  const site = await loadSiteByCode(code.toUpperCase());
  if (!site) notFound();

  const [needs, allSites] = await Promise.all([
    loadSiteNeeds(site.id),
    loadSites(),
  ]);
  const presents = await loadCurrentlyIn({ siteId: site.id });
  const presentsForStrip = presents.map((p) => ({
    employee_id: p.employee_id,
    full_name: p.full_name,
    clock_in_at: p.clock_in_at,
    site_id: p.site_id,
  }));
  const monday = week ? startOfWeek(parseISODate(week)) : startOfWeek(new Date());
  const { start, end } = weekRange(monday);

  const todayISO = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [
    { data: shiftsRaw },
    { data: crossShiftsRaw },
    { data: membersRaw },
    { data: eligibleRaw },
    { data: holidaysRaw },
    { data: closuresRaw },
  ] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        `id, employee_id, date, start_time, end_time, break_minutes, position, location, site_id, notes, is_overtime, overtime_multiplier, generation_note,
         employee:employees(id, full_name, job_title)`,
      )
      .eq("site_id", site.id)
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
    // Karim 2026-05-21 : shifts de TOUS les sites cette semaine, pour filtrer
    // les candidats "Ajouter un employé"/"Nouveau shift" -> ne pas proposer
    // un employé déjà occupé sur un autre site au même créneau.
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time")
      .neq("site_id", site.id)
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("site_assignments")
      .select("id, employee_id, start_date, is_primary")
      .eq("site_id", site.id)
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`)
      .order("is_primary", { ascending: false })
      .order("start_date", { ascending: false }),
    supabase
      .from("employees")
      .select("id, full_name, job_title")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("holidays")
      .select("id, date, label, kind, priority, tradition")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    supabase
      .from("company_closures")
      .select("id, label, start_date, end_date")
      .lte("start_date", end)
      .gte("end_date", start)
      .order("start_date"),
  ]);
  const shifts = (shiftsRaw ?? []) as unknown as Shift[];

  type AssignRow = {
    id: string;
    employee_id: string;
    start_date: string;
    is_primary: boolean;
  };
  const memberRows = (membersRaw ?? []) as AssignRow[];
  // Karim 2026-05-21 : fetch employees en 2eme requete (la jointure embed
  // Supabase ne ramene pas les donnees fiables sur cette table -> equipe
  // affichait 0 membre).
  const memberEmpIds = [...new Set(memberRows.map((m) => m.employee_id))];
  let employeesById = new Map<string, { id: string; full_name: string; job_title: string | null }>();
  if (memberEmpIds.length > 0) {
    const { data: empsRaw } = await supabase
      .from("employees")
      .select("id, full_name, job_title")
      .in("id", memberEmpIds)
      .eq("status", "active");
    employeesById = new Map(
      ((empsRaw ?? []) as Array<{ id: string; full_name: string; job_title: string | null }>).map(
        (e) => [e.id, e] as const,
      ),
    );
  }
  // Dedupe par employee_id : si plusieurs assignments actifs (doublons), on
  // garde le premier (priorise primary puis le plus recent grace au order).
  const seenEmpIds = new Set<string>();
  const members = memberRows
    .filter((m) => {
      if (!employeesById.has(m.employee_id)) return false;
      if (seenEmpIds.has(m.employee_id)) return false;
      seenEmpIds.add(m.employee_id);
      return true;
    })
    .map((m) => {
      const e = employeesById.get(m.employee_id)!;
      return {
        assignment_id: m.id,
        employee_id: e.id,
        full_name: e.full_name,
        job_title: e.job_title,
        is_primary: m.is_primary,
        start_date: m.start_date,
      };
    });
  const memberIds = new Set(members.map((m) => m.employee_id));
  const eligible = ((eligibleRaw ?? []) as Array<{
    id: string;
    full_name: string;
    job_title: string | null;
  }>).filter((e) => !memberIds.has(e.id));

  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const todayWeek = toISODate(startOfWeek(new Date()));

  const memberMinis = members.map((m) => ({
    employee_id: m.employee_id,
    full_name: m.full_name,
    job_title: m.job_title,
  }));

  return (
    <div className="space-y-4">
      {/* Navigateur de sites : strip horizontal, scrollable sur mobile,
          permet de basculer d un site a un autre sans repasser par la liste.
          Karim 14/05/2026. */}
      <SiteNavigator
        sites={allSites.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          abbr: s.abbr,
          color: s.color,
          light_color: s.light_color,
        }))}
        currentCode={site.code}
        weekISO={toISODate(monday)}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-md text-white font-bold"
              style={{ backgroundColor: site.color ?? "#666" }}
            >
              {site.abbr ?? site.code}
            </span>
            {site.name}
          </h1>
          {site.address ? (
            <p className="text-xs text-ink-3 inline-flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" /> {site.address}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 items-center flex-wrap">
          <GenerateSitePlanButton siteCode={site.code} weekISO={toISODate(monday)} />
          <AutoFillButton siteCode={site.code} weekISO={toISODate(monday)} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/planning/sites/${site.code}/display?week=${toISODate(monday)}`} target="_blank">
              📋 Vue affichable
            </Link>
          </Button>
          <ClearWeekButton weekISO={toISODate(monday)} siteId={site.id} />
          <ClearPlanningMenu siteId={site.id} />
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/planning/reinforcement?date=${toISODate(monday)}&site=${site.id}`}
              title="Lance une demande de renfort pre-remplie pour ce site"
            >
              <LifeBuoy className="h-3.5 w-3.5" /> Demande de renfort
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/planning/sites/${site.code}/print?week=${toISODate(monday)}`}
              target="_blank"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </Link>
          </Button>
          <span className="w-2" />
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${prevWeek}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${todayWeek}`}>Cette semaine</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?week=${nextWeek}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-sm text-ink-2">
        Du {monday.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "long" })} au{" "}
        {addDays(monday, 6).toLocaleDateString("fr-BE", {
          timeZone: "Europe/Brussels",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
      </p>

      <SitePresenceStrip siteId={site.id} initial={presentsForStrip} />

      {/* Karim 2026-05-22 : data loader mutualise (memes queries reutilisees ailleurs) */}
      {(await (async () => {
        const data = await loadSiteAnalyticsData(site.id, start, end);
        return (
          <SiteIncoherenceBanner data={data} siteCode={site.code} weekStart={start} />
        );
      })())}

      <SiteWeekBoard
        site={{
          id: site.id,
          code: site.code,
          name: site.name,
          color: site.color,
          light_color: site.light_color,
        }}
        mondayISO={toISODate(monday)}
        shifts={shifts}
        crossSiteShifts={(crossShiftsRaw ?? []) as Array<{
          employee_id: string;
          date: string;
          start_time: string;
          end_time: string;
        }>}
        needs={needs}
        members={memberMinis}
        closures={(closuresRaw ?? []) as Array<{
          id: string;
          label: string;
          start_date: string;
          end_date: string;
        }>}
        holidays={(holidaysRaw ?? []) as Array<{
          id: string;
          date: string;
          label: string;
          kind: string;
          priority: number | null;
          tradition: string | null;
        }>}
      />

      <SummaryRow needs={needs} shifts={shifts} />

      <OpeningHoursCard needs={needs} />

      <NeedsEditor siteId={site.id} needs={needs} />

      <MembersSection siteId={site.id} members={members} eligible={eligible} />
    </div>
  );
}

function SummaryRow({
  needs,
  shifts,
}: {
  needs: Awaited<ReturnType<typeof loadSiteNeeds>>;
  shifts: Shift[];
}) {
  const required = needs.reduce((acc, n) => {
    const [sh, sm] = n.start_time.split(":").map(Number);
    const [eh, em] = n.end_time.split(":").map(Number);
    const h = (eh * 60 + em - sh * 60 - sm) / 60;
    return acc + h * n.headcount;
  }, 0);
  const planned = shifts.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
    0,
  );
  const ratio = required > 0 ? (planned / required) * 100 : 0;
  const tone =
    ratio >= 90 ? "text-success" : ratio >= 60 ? "text-warn" : "text-danger";

  return (
    <Card>
      <div className="p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-3">Requises</div>
          <div className="font-mono font-bold text-xl">{required.toFixed(1)}h</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-3">Planifiées</div>
          <div className="font-mono font-bold text-xl">{planned.toFixed(1)}h</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-3">Couverture</div>
          <div className={`font-mono font-bold text-xl ${tone}`}>
            {ratio.toFixed(0)}%
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Amplitude horaire derivee des besoins is_enabled : pour chaque jour de la
 * semaine, l'horaire d'ouverture du magasin = min(start_time) - max(end_time)
 * parmi les creneaux actifs. Si tous les creneaux d'un jour sont eteints,
 * on affiche "Fermé".
 */
function OpeningHoursCard({ needs }: { needs: Awaited<ReturnType<typeof loadSiteNeeds>> }) {
  const DAYS = [
    { dow: 1, short: "Lun" },
    { dow: 2, short: "Mar" },
    { dow: 3, short: "Mer" },
    { dow: 4, short: "Jeu" },
    { dow: 5, short: "Ven" },
    { dow: 6, short: "Sam" },
    { dow: 0, short: "Dim" },
  ];
  const byDow = new Map<number, { start: string; end: string }[]>();
  for (const n of needs) {
    if (n.is_enabled === false) continue;
    const arr = byDow.get(n.day_of_week) ?? [];
    arr.push({ start: n.start_time.slice(0, 5), end: n.end_time.slice(0, 5) });
    byDow.set(n.day_of_week, arr);
  }
  function ampl(dow: number): string {
    const arr = byDow.get(dow);
    if (!arr || arr.length === 0) return "Fermé";
    const min = arr.reduce((a, b) => (a.start < b.start ? a : b)).start;
    const max = arr.reduce((a, b) => (a.end > b.end ? a : b)).end;
    return `${min} – ${max}`;
  }
  return (
    <Card>
      <div className="p-3 border-b border-line flex items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-sm">Heures d'ouverture du magasin</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Déduites automatiquement des besoins actifs ci-dessous. Édite les créneaux pour les ajuster.
          </p>
        </div>
      </div>
      <div className="p-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {DAYS.map((d) => {
          const a = ampl(d.dow);
          const closed = a === "Fermé";
          return (
            <div
              key={d.dow}
              className={`rounded border p-2 text-xs ${closed ? "border-dashed border-line/60 bg-surface-2/50" : "border-line bg-surface"}`}
            >
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">{d.short}</div>
              <div className={`font-mono font-bold ${closed ? "text-ink-3 italic" : ""}`}>{a}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
