import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";

// Karim : page Prestations = croise shifts planifies et clock_entries reels.
// Vues jour / semaine / mois. Tout calcule cote server component.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  addDays,
  parseISODate,
  startOfWeek,
  toISODate,
} from "@/lib/planning";
import { formatDurationMin } from "@/lib/clock";
import { PrestationsViewTabs, type PrestationsView } from "./prestations-view-tabs";
import { EditClockOutButton } from "./edit-clockout-button";
import { DayCorrect } from "./clock-editor";
import { AddShiftControls } from "./add-shift-controls";

type Shift = {
  id: string;
  employee_id: string;
  site_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
};

type ClockEntry = {
  id: string;
  employee_id: string;
  shift_id: string | null;
  site_id: string | null;
  kind: "in" | "out";
  occurred_at: string;
  source: string | null;
  entry_method: string | null;
  auto_clocked_out: boolean | null;
  is_anomalous: boolean | null;
};

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

// Toleance retard : > 5 min apres start_time = retard.
const LATE_TOLERANCE_MIN = 5;

function parseView(v: string | undefined): PrestationsView {
  if (v === "day" || v === "week" || v === "month" || v === "custom") return v;
  return "day";
}

/**
 * Calcule la duree en minutes entre start_time et end_time d un shift
 * (HH:MM:SS sur la meme date, ou nuit qui passe minuit).
 */
function shiftPlannedMinutes(shift: Shift): number {
  const [sh, sm] = shift.start_time.split(":").map(Number);
  const [eh, em] = shift.end_time.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // shift de nuit
  // Karim : on ne deduit PAS les break_minutes ici : on veut l "amplitude"
  // planifiee pour la comparer a l amplitude effective (clock_in -> clock_out).
  return Math.max(0, diff);
}

function shiftStartDateTime(shift: Shift): Date {
  return new Date(`${shift.date}T${shift.start_time.slice(0, 5)}:00`);
}
function shiftEndDateTime(shift: Shift): Date {
  const [sh] = shift.start_time.split(":").map(Number);
  const [eh] = shift.end_time.split(":").map(Number);
  const baseDate = parseISODate(shift.date);
  if (eh < sh) {
    // overnight
    const nextDay = addDays(baseDate, 1);
    return new Date(`${toISODate(nextDay)}T${shift.end_time.slice(0, 5)}:00`);
  }
  return new Date(`${shift.date}T${shift.end_time.slice(0, 5)}:00`);
}

/** Range [start, end] inclusive selon la vue active. */
function rangeForView(
  view: PrestationsView,
  today: Date,
  customFrom?: string,
  customTo?: string,
): { start: Date; end: Date; label: string } {
  if (view === "custom" && customFrom && customTo) {
    const s = parseISODate(customFrom);
    const e = parseISODate(customTo);
    return {
      start: s,
      end: e,
      label: `Du ${s.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })} au ${e.toLocaleDateString("fr-BE", { day: "2-digit", month: "long", year: "numeric" })}`,
    };
  }
  if (view === "day") {
    return {
      start: today,
      end: today,
      label: today.toLocaleDateString("fr-BE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    };
  }
  if (view === "week") {
    const monday = startOfWeek(today);
    const sunday = addDays(monday, 6);
    return {
      start: monday,
      end: sunday,
      label: `Semaine du ${monday.toLocaleDateString("fr-BE", {
        day: "2-digit",
        month: "long",
      })} au ${sunday.toLocaleDateString("fr-BE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}`,
    };
  }
  // month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    start: monthStart,
    end: monthEnd,
    label: today.toLocaleDateString("fr-BE", { month: "long", year: "numeric" }),
  };
}

function navDates(view: PrestationsView, today: Date): { prev: string; next: string } {
  if (view === "day") {
    return {
      prev: toISODate(addDays(today, -1)),
      next: toISODate(addDays(today, 1)),
    };
  }
  if (view === "week") {
    return {
      prev: toISODate(addDays(today, -7)),
      next: toISODate(addDays(today, 7)),
    };
  }
  return {
    prev: toISODate(new Date(today.getFullYear(), today.getMonth() - 1, 15)),
    next: toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 15)),
  };
}

type DaySummary = {
  date: string;
  shifts: Array<{
    shift: Shift;
    site: Site | null;
    clockIn: ClockEntry | null;
    clockOut: ClockEntry | null;
    workedMinutes: number | null;
    plannedMinutes: number;
    lateMinutes: number | null; // null = pas de clock_in
    isLate: boolean;
    isMissingOut: boolean;
    isAbsent: boolean;
    isAutoClosedOut: boolean;
  }>;
};

export default async function EmployeePrestationsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; date?: string; from?: string; to?: string }>;
}) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const canEditAutoOut = profile.role === "admin" || profile.role === "rh";
  const { id } = await props.params;
  const { view: vStr, date: dateStr, from: fromStr, to: toStr } = await props.searchParams;

  const view = parseView(vStr);
  const now = new Date();
  const nowMs = now.getTime();
  const refDate = dateStr ? parseISODate(dateStr) : new Date(now);
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);

  const { start, end, label } = rangeForView(view, refDate, fromStr, toStr);
  const { prev, next } = navDates(view, refDate);

  const supabase = await createClient();

  // Fenetre de fetch : on prend 60 jours glissants centres sur la periode
  // (au minimum la periode active +/- buffer pour matcher les clock_entries
  // qui pourraient deborder).
  const fetchStart = addDays(start, -1);
  const fetchEnd = addDays(end, 2);
  const fetchStartISO = toISODate(fetchStart);
  const fetchEndISO = toISODate(fetchEnd);
  // Pour clock_entries (timestamptz), on encadre large.
  const fetchStartTS = new Date(`${fetchStartISO}T00:00:00`).toISOString();
  const fetchEndTS = new Date(`${fetchEndISO}T23:59:59`).toISOString();

  const [
    { data: empRaw },
    { data: shiftsRaw },
    { data: entriesRaw },
    { data: sitesRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, weekly_hours, contract_type, start_date, status, job_title, department:departments(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, employee_id, site_id, date, start_time, end_time, break_minutes")
      .eq("employee_id", id)
      .gte("date", fetchStartISO)
      .lte("date", fetchEndISO)
      .order("date")
      .order("start_time"),
    supabase
      .from("clock_entries")
      .select(
        "id, employee_id, shift_id, site_id, kind, occurred_at, source, entry_method, auto_clocked_out, is_anomalous",
      )
      .eq("employee_id", id)
      .gte("occurred_at", fetchStartTS)
      .lte("occurred_at", fetchEndTS)
      .order("occurred_at"),
    supabase
      .from("sites")
      .select("id, code, name, color")
      .order("code"),
  ]);

  if (!empRaw) notFound();
  const employee = empRaw as unknown as {
    id: string;
    full_name: string;
    weekly_hours: number | null;
    contract_type: string | null;
    start_date: string | null;
    status: string;
    job_title: string | null;
    department: { name: string } | null;
  };
  const shifts = (shiftsRaw ?? []) as Shift[];
  const entries = (entriesRaw ?? []) as ClockEntry[];
  const sites = (sitesRaw ?? []) as Site[];
  const siteById = new Map(sites.map((s) => [s.id, s]));

  // Index clock_entries par shift_id (pour matching direct).
  // Si shift_id manquant on essaie matching par date + proximite (best effort).
  const inByShift = new Map<string, ClockEntry>();
  const outByShift = new Map<string, ClockEntry>();
  const orphanIns: ClockEntry[] = [];
  const orphanOuts: ClockEntry[] = [];
  for (const e of entries) {
    if (e.kind === "in") {
      if (e.shift_id) {
        // si plusieurs in pour le meme shift, on garde le plus ancien
        const existing = inByShift.get(e.shift_id);
        if (!existing || e.occurred_at < existing.occurred_at) {
          inByShift.set(e.shift_id, e);
        }
      } else {
        orphanIns.push(e);
      }
    } else if (e.kind === "out") {
      if (e.shift_id) {
        // garde le plus recent out pour ce shift
        const existing = outByShift.get(e.shift_id);
        if (!existing || e.occurred_at > existing.occurred_at) {
          outByShift.set(e.shift_id, e);
        }
      } else {
        orphanOuts.push(e);
      }
    }
  }

  // Best-effort : ratache les orphan IN au shift le plus proche (meme date)
  // qui n a pas deja un IN. Karim : utile car certains clock-in legacy ont
  // shift_id=null mais l intent est clair (1 shift dans la journee).
  function attachOrphan(orphan: ClockEntry, indexMap: Map<string, ClockEntry>, kind: "in" | "out") {
    const at = new Date(orphan.occurred_at);
    const atISO = toISODate(at);
    // candidates : shifts du meme jour
    const candidates = shifts.filter(
      (s) => s.date === atISO && !indexMap.has(s.id),
    );
    if (candidates.length === 0) return;
    // pick the closest shift_start
    let best: Shift | null = null;
    let bestDelta = Infinity;
    for (const s of candidates) {
      const ref = kind === "in" ? shiftStartDateTime(s) : shiftEndDateTime(s);
      const d = Math.abs(ref.getTime() - at.getTime());
      if (d < bestDelta) {
        bestDelta = d;
        best = s;
      }
    }
    // ne match que si delta < 6h (sinon c est probablement un autre shift)
    if (best && bestDelta < 6 * 3600_000) {
      indexMap.set(best.id, orphan);
    }
  }
  // Trace les orphans pour identifier ceux NON-attaches a un shift
  const attachedIns = new Set<string>();
  const attachedOuts = new Set<string>();
  for (const o of orphanIns) {
    const before = inByShift.size;
    attachOrphan(o, inByShift, "in");
    if (inByShift.size > before) attachedIns.add(o.id);
  }
  for (const o of orphanOuts) {
    const before = outByShift.size;
    attachOrphan(o, outByShift, "out");
    if (outByShift.size > before) attachedOuts.add(o.id);
  }
  // Orphans qui n ont AUCUN shift correspondant (employee a pointe un jour
  // sans shift planifie). Karim 2026-05-24 : ces pointages doivent etre
  // affiches comme rows "hors shift" sinon on les perd dans le rapport mois.
  const unattachedIns = orphanIns.filter((e) => !attachedIns.has(e.id));
  const unattachedOuts = orphanOuts.filter((e) => !attachedOuts.has(e.id));

  // Construit la liste jour par jour pour la periode visible.
  const endMs = end.getTime();
  // build day list iso strings
  const dayList: string[] = [];
  {
    let cursor = new Date(start);
    while (cursor.getTime() <= endMs) {
      dayList.push(toISODate(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  // shifts visibles dans la periode (filtre par date in [start..end])
  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const visibleShifts = shifts.filter((s) => s.date >= startISO && s.date <= endISO);

  // Calcule par shift
  type Row = DaySummary["shifts"][number];
  const rowsByDate = new Map<string, Row[]>();
  for (const d of dayList) rowsByDate.set(d, []);

  let totalPlanned = 0;
  let totalWorked = 0;
  // Karim 2026-05-24 : totalWorkedOffPlan = heures realisees HORS shift planifie
  // (pointages orphelins). Permet d afficher "X heures dont Y hors planning"
  // au lieu de gonfler artificiellement la diff effectue - planifie.
  let totalWorkedOffPlan = 0;
  let totalLateCount = 0;
  let totalMissingOut = 0;
  let totalAbsent = 0;
  let totalShifts = 0;
  let totalShiftsWithPointage = 0;

  for (const s of visibleShifts) {
    const site = s.site_id ? siteById.get(s.site_id) ?? null : null;
    const clockIn = inByShift.get(s.id) ?? null;
    const clockOut = outByShift.get(s.id) ?? null;
    const plannedMin = shiftPlannedMinutes(s);
    const shiftEnded = shiftEndDateTime(s).getTime() < nowMs;
    // Karim 2026-05-24 : shift FUTUR = shift dont la date n est pas encore
    // arrivee. Ne doit PAS compter dans totalPlanned/totalShifts (sinon on
    // additionne des heures fictives au prorata du mois entier).
    const shiftStarted = shiftStartDateTime(s).getTime() <= nowMs;

    let workedMin: number | null = null;
    if (clockIn && clockOut) {
      const diff = (new Date(clockOut.occurred_at).getTime() - new Date(clockIn.occurred_at).getTime()) / 60_000;
      if (diff > 0) workedMin = diff;
    }

    let lateMin: number | null = null;
    let isLate = false;
    if (clockIn) {
      const planned = shiftStartDateTime(s);
      lateMin = (new Date(clockIn.occurred_at).getTime() - planned.getTime()) / 60_000;
      if (lateMin > LATE_TOLERANCE_MIN) isLate = true;
    }

    const isMissingOut = !!clockIn && !clockOut && shiftEnded;
    const isAbsent = !clockIn && shiftEnded;
    const isAutoClosedOut = !!clockOut?.auto_clocked_out;

    // KPIs : on ne compte que les shifts PASSES (commences) dans les totaux.
    if (shiftStarted) {
      totalPlanned += plannedMin;
      if (workedMin != null) totalWorked += workedMin;
      if (isLate) totalLateCount += 1;
      if (isMissingOut) totalMissingOut += 1;
      if (isAbsent) totalAbsent += 1;
      totalShifts += 1;
      if (clockIn) totalShiftsWithPointage += 1;
    }

    const row: Row = {
      shift: s,
      site,
      clockIn,
      clockOut,
      workedMinutes: workedMin,
      plannedMinutes: plannedMin,
      lateMinutes: lateMin,
      isLate,
      isMissingOut,
      isAbsent,
      isAutoClosedOut,
    };
    const list = rowsByDate.get(s.date);
    if (list) list.push(row);
  }

  // Karim 2026-05-24 : ajoute les pointages ORPHELINS (hors shift planifie)
  // en tant que rows "hors shift" pour qu ils apparaissent dans le rapport.
  // Sans ce fix, un employee qui pointe sur Pointage A un jour sans shift
  // planifie reste invisible dans la vue Prestations.
  const insByOrphanDate = new Map<string, ClockEntry[]>();
  for (const e of unattachedIns) {
    const d = e.occurred_at.slice(0, 10);
    insByOrphanDate.set(d, [...(insByOrphanDate.get(d) ?? []), e]);
  }
  const outsByOrphanDate = new Map<string, ClockEntry[]>();
  for (const e of unattachedOuts) {
    const d = e.occurred_at.slice(0, 10);
    outsByOrphanDate.set(d, [...(outsByOrphanDate.get(d) ?? []), e]);
  }

  for (const [date, ins] of insByOrphanDate.entries()) {
    if (date < startISO || date > endISO) continue;
    if (!rowsByDate.has(date)) continue;
    const outs = (outsByOrphanDate.get(date) ?? []).sort((a, b) =>
      a.occurred_at < b.occurred_at ? -1 : 1,
    );
    const sortedIns = [...ins].sort((a, b) =>
      a.occurred_at < b.occurred_at ? -1 : 1,
    );
    for (let i = 0; i < sortedIns.length; i++) {
      const cIn = sortedIns[i];
      const cOut = outs[i] ?? null;
      let workedMin: number | null = null;
      if (cIn && cOut) {
        const diff = (new Date(cOut.occurred_at).getTime() - new Date(cIn.occurred_at).getTime()) / 60_000;
        if (diff > 0) workedMin = diff;
      }
      if (workedMin != null) {
        totalWorked += workedMin;
        totalWorkedOffPlan += workedMin;
      }
      // Note Karim : on n incremente PAS totalShifts/totalShiftsWithPointage
      // pour les orphans (sinon les % de ponctualite et absences sont fausses).
      const orphanShift: Shift = {
        id: `orphan-${cIn.id}`,
        employee_id: cIn.employee_id,
        site_id: cIn.site_id,
        date,
        start_time: cIn.occurred_at.slice(11, 19),
        end_time: cOut?.occurred_at.slice(11, 19) ?? cIn.occurred_at.slice(11, 19),
        break_minutes: 0,
      };
      const row: Row = {
        shift: orphanShift,
        site: cIn.site_id ? siteById.get(cIn.site_id) ?? null : null,
        clockIn: cIn,
        clockOut: cOut,
        workedMinutes: workedMin,
        plannedMinutes: 0,
        lateMinutes: null,
        isLate: false,
        isMissingOut: !!cIn && !cOut,
        isAbsent: false,
        isAutoClosedOut: !!cOut?.auto_clocked_out,
      };
      const list = rowsByDate.get(date);
      if (list) list.push(row);
    }
  }

  const diffMin = totalWorked - totalPlanned;
  const punctualPct =
    totalShiftsWithPointage > 0
      ? Math.round(((totalShiftsWithPointage - totalLateCount) / totalShiftsWithPointage) * 100)
      : null;

  // Karim 2026-05-25 : compte les jours REELLEMENT prestes (au moins un IN+OUT
  // ou des minutes travaillees dans la journee). Different de totalShifts qui
  // compte les shifts planifies.
  const daysWorkedSet = new Set<string>();
  for (const [date, rows] of rowsByDate.entries()) {
    if (rows.some((r) => (r.workedMinutes ?? 0) > 0 || (r.clockIn && !r.isAbsent))) {
      daysWorkedSet.add(date);
    }
  }
  const totalDaysWorked = daysWorkedSet.size;

  const todayISO = toISODate(new Date());

  // Karim 2026-05-25 : ventilation par semaine (utile en vue Mois ou Custom
  // pour voir "Semaine 1 = 36h, Semaine 2 = 38h, etc"). On groupe les jours
  // par lundi-dimanche et somme worked_minutes.
  type WeekBreakdown = { weekStart: string; weekEnd: string; weekLabel: string; workedMin: number; plannedMin: number; days: number };
  const weekBreakdown: WeekBreakdown[] = [];
  if (view === "month" || view === "custom") {
    const weekByMonday = new Map<string, WeekBreakdown>();
    for (const [date, rows] of rowsByDate.entries()) {
      if (rows.length === 0) continue;
      const d = parseISODate(date);
      const monday = startOfWeek(d);
      const sunday = addDays(monday, 6);
      const mondayISO = toISODate(monday);
      const sundayISO = toISODate(sunday);
      const existing = weekByMonday.get(mondayISO) ?? {
        weekStart: mondayISO,
        weekEnd: sundayISO,
        weekLabel: `${monday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })} – ${sunday.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}`,
        workedMin: 0,
        plannedMin: 0,
        days: 0,
      };
      let dayHasData = false;
      for (const r of rows) {
        if (r.workedMinutes != null) existing.workedMin += r.workedMinutes;
        existing.plannedMin += r.plannedMinutes;
        if (r.workedMinutes != null || r.plannedMinutes > 0) dayHasData = true;
      }
      if (dayHasData) existing.days += 1;
      weekByMonday.set(mondayISO, existing);
    }
    weekBreakdown.push(...[...weekByMonday.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)));
  }

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
          <h1 className="text-2xl font-bold mt-1 inline-flex items-center gap-2">
            <Activity className="h-5 w-5 text-gold-dark" />
            Prestations – {employee.full_name}
          </h1>
          <p className="text-sm text-ink-2">
            {employee.job_title ?? "—"} ·{" "}
            {employee.department?.name ?? "Sans service"} ·{" "}
            {employee.weekly_hours ?? 38}h/sem
          </p>
        </div>
        <PrestationsViewTabs
          current={view}
          dateISO={toISODate(refDate)}
          prevDateISO={prev}
          nextDateISO={next}
          todayISO={todayISO}
          customFrom={fromStr ?? toISODate(start)}
          customTo={toStr ?? toISODate(end)}
        />
      </div>

      {/* Karim 2026-06-02 : controles RH pour combler les trous de pointage
          (shift manuel, jour repos, historique des corrections). */}
      <AddShiftControls
        employeeId={employee.id}
        sites={sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
        defaultDate={toISODate(refDate)}
      />

      <div className="text-sm text-ink-2 inline-flex items-center gap-2 flex-wrap">
        <CalendarDays className="h-3.5 w-3.5 text-ink-3" />
        <span className="capitalize">{label}</span>
        <span className="text-ink-3">·</span>
        <span>
          {totalShifts} shift{totalShifts > 1 ? "s" : ""} planifié
          {totalShifts > 1 ? "s" : ""}
        </span>
        {totalWorkedOffPlan > 0 ? (
          <>
            <span className="text-ink-3">·</span>
            <span className="text-amber-700">
              {formatDurationMin(totalWorkedOffPlan)} hors planning
            </span>
          </>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Heures planifiées"
          value={formatDurationMin(totalPlanned)}
          sub={totalShifts > 0 ? `${totalShifts} shift${totalShifts > 1 ? "s" : ""} passé${totalShifts > 1 ? "s" : ""}` : undefined}
          tone="neutral"
        />
        <Kpi
          icon={<Timer className="h-4 w-4" />}
          label="Heures effectuées"
          value={formatDurationMin(totalWorked)}
          sub={
            totalWorkedOffPlan > 0
              ? `dont ${formatDurationMin(totalWorkedOffPlan)} hors planning`
              : totalPlanned > 0
                ? `${diffMin >= 0 ? "+" : ""}${formatDurationMin(Math.abs(diffMin))} vs prévu`
                : undefined
          }
          subTone={totalWorkedOffPlan > 0 ? "warn" : diffMin >= 0 ? "success" : "danger"}
          tone={totalWorked > 0 ? "success" : "neutral"}
        />
        <Kpi
          icon={<CalendarDays className="h-4 w-4" />}
          label="Jours prestés"
          value={String(totalDaysWorked)}
          sub={totalDaysWorked > 0 ? `moy. ${formatDurationMin(Math.round(totalWorked / totalDaysWorked))}/jour` : undefined}
          subTone="neutral"
          tone={totalDaysWorked > 0 ? "success" : "neutral"}
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Retards"
          value={String(totalLateCount)}
          sub={
            punctualPct != null ? `${punctualPct}% ponctuel` : "Pas de pointage"
          }
          subTone={punctualPct != null && punctualPct >= 80 ? "success" : "danger"}
          tone={totalLateCount === 0 ? "success" : totalLateCount <= 2 ? "warn" : "danger"}
        />
        <Kpi
          icon={<XCircle className="h-4 w-4" />}
          label="Absences"
          value={String(totalAbsent)}
          sub={
            totalMissingOut > 0
              ? `${totalMissingOut} OUT manquant${totalMissingOut > 1 ? "s" : ""}`
              : undefined
          }
          subTone={totalMissingOut > 0 ? "warn" : "success"}
          tone={totalAbsent === 0 ? "success" : "danger"}
        />
      </div>

      {/* Karim 2026-05-25 : Ventilation hebdo (vue Mois ou Custom uniquement) */}
      {weekBreakdown.length > 0 ? (
        <Card>
          <div className="px-4 py-3 border-b border-line">
            <h2 className="font-bold text-sm">Ventilation par semaine</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Total effectué par semaine (lundi → dimanche).
            </p>
          </div>
          <div className="divide-y divide-line">
            {weekBreakdown.map((w, i) => (
              <div
                key={w.weekStart}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center justify-center min-w-[78px] h-6 px-2 rounded bg-gold-light text-gold-dark font-bold text-[11px]">
                    Semaine {i + 1}
                  </span>
                  <span className="text-xs text-ink-3 font-mono">{w.weekLabel}</span>
                  <span className="text-[10px] text-ink-3">{w.days} jour{w.days > 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  {w.plannedMin > 0 ? (
                    <span className="text-[11px] text-ink-3">
                      Planifié : <span className="font-mono">{formatDurationMin(w.plannedMin)}</span>
                    </span>
                  ) : null}
                  <span className="text-sm font-bold tabular-nums">
                    {formatDurationMin(w.workedMin)}
                  </span>
                </div>
              </div>
            ))}
            <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-surface-2/40">
              <span className="font-bold text-sm">Total période</span>
              <span className="text-sm font-bold tabular-nums">
                {formatDurationMin(weekBreakdown.reduce((a, w) => a + w.workedMin, 0))}
              </span>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Liste detaillee */}
      <Card>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm">Détail jour par jour</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Comparaison entre shifts planifiés et pointages réels.
            </p>
          </div>
          <Legend />
        </div>
        <div className="divide-y divide-line">
          {dayList.map((iso) => {
            const rows = rowsByDate.get(iso) ?? [];
            const d = parseISODate(iso);
            const isToday = iso === todayISO;
            const dayPlanned = rows.reduce((a, r) => a + r.plannedMinutes, 0);
            const dayWorked = rows.reduce((a, r) => a + (r.workedMinutes ?? 0), 0);
            // Karim 2026-06-18 : tous les pointages du jour (dédupliqués) pour le
            // bouton « Corriger les pointages » présent sur CHAQUE jour.
            const dayEntries = rows
              .flatMap((r) => [r.clockIn, r.clockOut])
              .filter((x): x is NonNullable<typeof x> => !!x)
              .filter((e, i, arr) => arr.findIndex((z) => z.id === e.id) === i)
              .map((e) => ({ id: e.id, kind: e.kind, occurred_at: e.occurred_at, source: e.source }));
            return (
              <div
                key={iso}
                className={`p-3 ${isToday ? "bg-gold-light/20" : ""}`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold capitalize ${
                        isToday ? "text-gold-dark" : ""
                      }`}
                    >
                      {d.toLocaleDateString("fr-BE", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      })}
                    </span>
                    {isToday ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gold-dark bg-gold-light/60 rounded-full px-1.5">
                        Aujourd&apos;hui
                      </span>
                    ) : null}
                  </div>
                  {rows.length > 0 ? (
                    <span className="text-[11px] font-mono text-ink-3">
                      {formatDurationMin(dayWorked)} / {formatDurationMin(dayPlanned)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-3 italic">Repos</span>
                  )}
                </div>
                {rows.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {rows.map((r, idx) => (
                      <ShiftRow
                        key={r.shift.id + idx}
                        row={r}
                        employeeId={employee.id}
                        canEditAutoOut={canEditAutoOut}
                      />
                    ))}
                  </div>
                ) : null}
                {/* Karim 2026-06-18 : bouton « Corriger les pointages » sur CHAQUE
                    jour (même Repos / données non remontées). */}
                <DayCorrect
                  employeeId={employee.id}
                  day={iso}
                  entries={dayEntries}
                  canEdit={canEditAutoOut}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
  subTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "warn" | "danger";
  subTone?: "neutral" | "success" | "warn" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-gold-dark";
  const subClass =
    subTone === "success"
      ? "text-success"
      : subTone === "warn"
        ? "text-warn"
        : subTone === "danger"
          ? "text-danger"
          : "text-ink-3";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-ink-3">
        <span className={toneClass}>{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>
        {value}
      </div>
      {sub ? <div className={`text-[11px] mt-0.5 ${subClass}`}>{sub}</div> : null}
    </Card>
  );
}

function ShiftRow({
  row,
  employeeId,
  canEditAutoOut,
}: {
  row: DaySummary["shifts"][number];
  employeeId: string;
  canEditAutoOut: boolean;
}) {
  const { shift, site, clockIn, clockOut, workedMinutes, plannedMinutes, lateMinutes, isLate, isMissingOut, isAbsent, isAutoClosedOut } = row;
  // Karim 2026-06-13 : IN/OUT ne sont plus affiches ici (le ClockEditor en bas
  // les montre, a l'heure de Bruxelles et editables) -> on evite le doublon /
  // l'ancien affichage en UTC (-2h).
  const diffMin = workedMinutes != null ? workedMinutes - plannedMinutes : null;
  // Karim 2026-05-25 : row "hors shift planifie" -> ne PAS afficher les heures
  // du clock_entry comme horaire planifie (trompeur). Affiche "Hors planning".
  const isOrphan = shift.id.startsWith("orphan-");
  return (
    <div className="flex items-center flex-wrap gap-2 text-xs bg-surface-2/40 rounded px-2 py-1.5">
      {site ? (
        <span
          className="inline-flex items-center justify-center min-w-[28px] h-5 px-1 rounded text-white font-bold text-[10px]"
          style={{ backgroundColor: site.color ?? "#666" }}
          title={site.name}
        >
          {site.code}
        </span>
      ) : (
        <span className="inline-flex items-center justify-center min-w-[28px] h-5 px-1 rounded bg-surface-2 text-ink-3 font-bold text-[10px]">
          —
        </span>
      )}
      {isOrphan ? (
        <span className="font-mono text-amber-700 italic text-[11px]" title="Aucun shift planifié — pointage hors planning">
          Hors planning
        </span>
      ) : (
        <span className="font-mono text-ink-2">
          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
        </span>
      )}
      <span className="ml-auto" />
      <span
        className={`font-mono ${isAutoClosedOut ? "italic text-amber-700" : "text-ink-2"}`}
        title={isAutoClosedOut ? "Durée estimée (OUT auto-fermé) — non confirmée Tuya" : "Durée réelle Tuya"}
      >
        {workedMinutes != null
          ? `${formatDurationMin(workedMinutes)}${isAutoClosedOut ? "*" : ""} / ${formatDurationMin(plannedMinutes)}`
          : `— / ${formatDurationMin(plannedMinutes)}`}
      </span>
      {diffMin != null ? (
        <span
          className={`font-mono text-[10px] ${diffMin >= 0 ? "text-success" : "text-danger"}`}
        >
          {diffMin >= 0 ? "+" : ""}
          {formatDurationMin(Math.abs(diffMin))}
        </span>
      ) : null}
      <div className="flex items-center gap-1 flex-wrap">
        {isAbsent ? (
          <Badge variant="refused">
            <XCircle className="h-2.5 w-2.5" /> Absent
          </Badge>
        ) : null}
        {isLate && !isAbsent ? (
          <Badge variant="rdv_scheduled">
            <AlertTriangle className="h-2.5 w-2.5" /> Retard{" "}
            {lateMinutes != null ? `${Math.round(lateMinutes)}min` : ""}
          </Badge>
        ) : null}
        {isMissingOut ? (
          <Badge variant="refused">
            <AlertTriangle className="h-2.5 w-2.5" /> OUT manquant
          </Badge>
        ) : null}
        {isAutoClosedOut ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
            title={clockOut?.id ? `OUT automatique à la fermeture du site (entry ${clockOut.id.slice(0,8)})` : "OUT automatique"}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            AUTO-OUT (corrigible)
          </span>
        ) : null}
        {isAutoClosedOut && canEditAutoOut && clockOut?.id && clockOut.occurred_at ? (
          <EditClockOutButton
            clockOutEntryId={clockOut.id}
            currentOccurredAt={clockOut.occurred_at}
            employeeId={employeeId}
          />
        ) : null}
        {!isLate && !isMissingOut && !isAbsent && clockIn && clockOut ? (
          <Badge variant="rdv_done">
            <CheckCircle2 className="h-2.5 w-2.5" /> OK
          </Badge>
        ) : null}
        {!clockIn && !isAbsent ? (
          <Badge variant="muted">À venir</Badge>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="rdv_done">OK</Badge>
      <Badge variant="rdv_scheduled">Retard</Badge>
      <Badge variant="refused">Absent / OUT manquant</Badge>
      <Badge variant="muted">auto-OUT / à venir</Badge>
    </div>
  );
}

