import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Printer, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  startOfWeek,
  parseISODate,
  addDays,
  toISODate,
  shiftHours,
} from "@/lib/planning";
import { ViewSwitcher, PrintMenu } from "./view-switcher";
import { ShareButton } from "./share-button";
import { FilterTabs, type ShiftFilter } from "./filter-tabs";
import { WeekBoard } from "./week-board";

type View = "week" | "month" | "year";

function parseFilter(s: string | undefined): ShiftFilter {
  return s === "contract" || s === "overtime" ? s : "all";
}

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  is_overtime?: boolean | null;
  overtime_multiplier?: number | null;
  site: { code: string; name: string; color: string | null } | null;
};

function parseView(s: string | undefined): View {
  return s === "month" || s === "year" ? s : "week";
}

export default async function EmployeeCalendarPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; date?: string; filter?: string }>;
}) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  // Le manager peut consulter le calendrier mais NE doit PAS imprimer la vue
  // admin/RH avec heures sup (règle Karim 2026-05-11). Seuls admin et rh ont
  // l'option "Vue admin (avec h. sup)" dans le PrintMenu.
  const canSeeOvertime = profile.role === "admin" || profile.role === "rh";
  const { id } = await props.params;
  const { view: vStr, date: dateStr, filter: fStr } = await props.searchParams;
  const view = parseView(vStr);
  // Manager ne voit que la vue contractuelle (pas accès aux OT).
  const filter: ShiftFilter = canSeeOvertime ? parseFilter(fStr) : "contract";
  const today = dateStr ? parseISODate(dateStr) : new Date();

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, job_title, weekly_hours, status, department:departments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();
  const employee = emp as unknown as {
    id: string;
    full_name: string;
    job_title: string | null;
    weekly_hours: number | null;
    status: string;
    department: { name: string } | null;
  };

  // Range selon vue
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "week") {
    rangeStart = startOfWeek(today);
    rangeEnd = addDays(rangeStart, 6);
  } else if (view === "month") {
    rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else {
    rangeStart = new Date(today.getFullYear(), 0, 1);
    rangeEnd = new Date(today.getFullYear(), 11, 31);
  }

  const todayISO = toISODate(new Date());
  const [{ data: shiftsRaw }, { data: sitesRaw }, { data: assignsRaw }] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        `id, date, start_time, end_time, break_minutes, position, location, is_overtime, overtime_multiplier,
         site_id, notes,
         site:sites(code, name, color)`,
      )
      .eq("employee_id", employee.id)
      .gte("date", toISODate(rangeStart))
      .lte("date", toISODate(rangeEnd))
      .order("date")
      .order("start_time"),
    supabase.from("sites").select("id, code, name, color").order("code"),
    supabase
      .from("site_assignments")
      .select("site_id")
      .eq("employee_id", employee.id)
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`),
  ]);
  const sites = ((sitesRaw ?? []) as Array<{ id: string; code: string; name: string; color: string | null }>);
  const preferredSiteIds = ((assignsRaw ?? []) as Array<{ site_id: string }>).map((a) => a.site_id);
  const shiftsAll = (shiftsRaw ?? []) as unknown as Shift[];
  const shifts =
    filter === "contract"
      ? shiftsAll.filter((s) => !s.is_overtime)
      : filter === "overtime"
        ? shiftsAll.filter((s) => !!s.is_overtime)
        : shiftsAll;

  const contractHours = shiftsAll
    .filter((s) => !s.is_overtime)
    .reduce((a, s) => a + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  const otHours = shiftsAll
    .filter((s) => !!s.is_overtime)
    .reduce((a, s) => a + shiftHours(s.start_time, s.end_time, s.break_minutes), 0);
  const totalHours = contractHours + otHours;
  const visibleHours =
    filter === "contract" ? contractHours : filter === "overtime" ? otHours : totalHours;

  // Navigation prev/next
  const navPrev = (() => {
    if (view === "week") return toISODate(addDays(today, -7));
    if (view === "month")
      return toISODate(new Date(today.getFullYear(), today.getMonth() - 1, 15));
    return toISODate(new Date(today.getFullYear() - 1, 6, 1));
  })();
  const navNext = (() => {
    if (view === "week") return toISODate(addDays(today, 7));
    if (view === "month")
      return toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 15));
    return toISODate(new Date(today.getFullYear() + 1, 6, 1));
  })();
  const navToday = toISODate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link
            href={`/planning/employees/${employee.id}`}
            className="text-xs text-ink-3 hover:text-gold-dark inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Fiche employé
          </Link>
          <h1 className="text-2xl font-bold mt-1">{employee.full_name}</h1>
          <p className="text-sm text-ink-2">
            {employee.job_title ?? "—"} ·{" "}
            {employee.department?.name ?? "Sans service"} ·{" "}
            {employee.weekly_hours ?? 38}h/sem
          </p>
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {canSeeOvertime ? <FilterTabs current={filter} /> : null}
          <ViewSwitcher current={view} dateISO={toISODate(today)} />
          <PrintMenu employeeId={employee.id} canSeeOvertime={canSeeOvertime} />
          <ShareButton
            employeeId={employee.id}
            employeeName={employee.full_name}
            weekISO={toISODate(view === "week" ? rangeStart : startOfWeek(today))}
          />
          <span className="w-2" />
          <Button asChild variant="outline" size="sm">
            <Link href={`?view=${view}&date=${navPrev}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?view=${view}&date=${navToday}`}>Aujourd'hui</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`?view=${view}&date=${navNext}`}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="text-sm text-ink-2 flex items-center gap-2 flex-wrap">
        <span>
          {view === "week" ? (
            <>
              Semaine du{" "}
              {rangeStart.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
            </>
          ) : view === "month" ? (
            <>{today.toLocaleDateString("fr-BE", { month: "long", year: "numeric" })}</>
          ) : (
            <>Année {today.getFullYear()}</>
          )}{" "}
          · <span className="font-bold">{visibleHours.toFixed(1)}h</span> ·{" "}
          {shifts.length} shift{shifts.length > 1 ? "s" : ""}
        </span>
        {canSeeOvertime && filter === "all" ? (
          <>
            <span className="text-ink-3">·</span>
            <span className="inline-flex items-center gap-1 rounded bg-gold-light/60 text-gold-dark px-1.5 py-0.5 text-[11px] font-bold">
              Contractuel {contractHours.toFixed(1)}h
            </span>
            {otHours > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-orange-100 text-orange-700 px-1.5 py-0.5 text-[11px] font-bold">
                H. sup {otHours.toFixed(1)}h
              </span>
            ) : null}
          </>
        ) : null}
        {filter === "contract" && employee.weekly_hours && view === "week" ? (
          <span
            className={`text-[11px] font-bold ${
              contractHours > employee.weekly_hours
                ? "text-warn"
                : contractHours < employee.weekly_hours
                  ? "text-ink-3"
                  : "text-success"
            }`}
          >
            cible {employee.weekly_hours}h
          </span>
        ) : null}
      </div>

      {view === "week" ? (
        <WeekBoard
          monday={rangeStart}
          shifts={shifts}
          employeeId={employee.id}
          employeeName={employee.full_name}
          sites={sites}
          preferredSiteIds={preferredSiteIds}
          canEdit={canSeeOvertime}
        />
      ) : view === "month" ? (
        <MonthView monthStart={rangeStart} shifts={shifts} />
      ) : (
        <YearView year={today.getFullYear()} shifts={shifts} />
      )}
    </div>
  );
}

function MonthView({ monthStart, shifts }: { monthStart: Date; shifts: Shift[] }) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Première colonne = lundi (1=Lun..0=Dim → on shift)
  const firstDow = new Date(year, month, 1).getDay(); // 0=Dim..6=Sam
  const offsetMon = (firstDow + 6) % 7;

  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }

  const cells: Array<{ d: Date | null; iso: string }> = [];
  for (let i = 0; i < offsetMon; i++) cells.push({ d: null, iso: "" });
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    cells.push({ d, iso: toISODate(d) });
  }
  while (cells.length % 7 !== 0) cells.push({ d: null, iso: "" });

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((l) => (
          <div
            key={l}
            className="text-[10px] uppercase tracking-wider font-bold text-ink-3 text-center py-2"
          >
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const dShifts = c.iso ? byDate.get(c.iso) ?? [] : [];
          const dh = dShifts.reduce(
            (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes),
            0,
          );
          const isToday = c.iso === toISODate(new Date());
          return (
            <div
              key={i}
              className={`min-h-[80px] border-b border-r border-line p-1 ${
                c.d ? "" : "bg-surface-2/50"
              } ${isToday ? "bg-gold-light/30" : ""}`}
            >
              {c.d ? (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isToday ? "text-gold-dark" : "text-ink-2"
                      }`}
                    >
                      {c.d.getDate()}
                    </span>
                    {dh > 0 ? (
                      <span className="text-[9px] font-mono text-ink-3">{dh.toFixed(1)}h</span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {dShifts.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className={`text-[9px] truncate rounded px-1 leading-tight py-0.5 ${
                          s.is_overtime ? "border border-dashed border-orange-400" : ""
                        }`}
                        style={{
                          backgroundColor: s.is_overtime
                            ? "rgb(255 237 213 / 0.8)"
                            : s.site?.color
                              ? `${s.site.color}25`
                              : "rgb(245 235 200 / 0.7)",
                          color: s.is_overtime ? "#9a3412" : (s.site?.color ?? "#92783a"),
                        }}
                        title={
                          s.is_overtime
                            ? `Heures sup.${s.overtime_multiplier ? ` ×${s.overtime_multiplier}` : ""}`
                            : undefined
                        }
                      >
                        {s.is_overtime ? "🔥 " : ""}
                        {s.start_time.slice(0, 5)} {s.site?.code ?? ""}
                      </div>
                    ))}
                    {dShifts.length > 3 ? (
                      <div className="text-[9px] text-ink-3">+{dShifts.length - 3}</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function YearView({ year, shifts }: { year: number; shifts: Shift[] }) {
  const byDate = new Map<string, number>();
  for (const s of shifts) {
    const h = shiftHours(s.start_time, s.end_time, s.break_minutes);
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + h);
  }
  const months = Array.from({ length: 12 }, (_, m) => new Date(year, m, 1));

  return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {months.map((mStart) => {
        const m = mStart.getMonth();
        const lastDay = new Date(year, m + 1, 0).getDate();
        const firstDow = mStart.getDay();
        const offsetMon = (firstDow + 6) % 7;

        const cells: Array<{ d: Date | null; iso: string }> = [];
        for (let i = 0; i < offsetMon; i++) cells.push({ d: null, iso: "" });
        for (let day = 1; day <= lastDay; day++) {
          const d = new Date(year, m, day);
          cells.push({ d, iso: toISODate(d) });
        }
        while (cells.length % 7 !== 0) cells.push({ d: null, iso: "" });

        const monthHours = cells.reduce(
          (acc, c) => acc + (c.iso ? byDate.get(c.iso) ?? 0 : 0),
          0,
        );

        return (
          <Card key={m} className="overflow-hidden">
            <div className="px-3 py-2 border-b border-line bg-surface-2 flex items-center justify-between">
              <span className="font-bold capitalize">
                {mStart.toLocaleDateString("fr-BE", { month: "long" })}
              </span>
              <span className="text-[10px] font-mono text-ink-3">
                {monthHours.toFixed(0)}h
              </span>
            </div>
            <div className="grid grid-cols-7 gap-px p-1">
              {cells.map((c, i) => {
                const h = c.iso ? byDate.get(c.iso) ?? 0 : 0;
                const intensity =
                  h === 0 ? 0 : h < 4 ? 1 : h < 8 ? 2 : 3;
                const bg = [
                  "bg-surface-2/30",
                  "bg-gold-light/40",
                  "bg-gold-light",
                  "bg-gold/70",
                ][intensity];
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-sm ${
                      c.d ? bg : ""
                    } flex items-center justify-center text-[8px]`}
                    title={c.iso ? `${c.iso} — ${h.toFixed(1)}h` : ""}
                  >
                    {c.d ? c.d.getDate() : ""}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
