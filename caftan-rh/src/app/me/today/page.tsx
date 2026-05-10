import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarOff,
  Megaphone,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  LogIn,
  LogOut,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiveDuration } from "./live-duration";
import { PushEnableButton } from "@/components/push-enable-button";
import { getPublicVapidKey } from "@/lib/push-notify";
import { getLocale } from "@/lib/locale-server";
import { t, dateLocaleStr, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
  location: string | null;
  status: string;
  site_id: string | null;
  site: { code: string; name: string } | null;
};

type Reinforcement = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
  expires_at: string | null;
  site: { code: string; name: string } | null;
};

type SwapRequestRaw = {
  id: string;
  reason: string | null;
  requester_employee_id: string;
  requester_shift_id: string;
};
type SwapRequest = {
  id: string;
  reason: string | null;
  requesterName: string | null;
  shift: {
    date: string;
    start_time: string;
    end_time: string;
    siteCode: string | null;
  } | null;
};

type AbsenceCall = {
  id: string;
  date: string;
  reason: string;
  shift:
    | {
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        site_id: string | null;
        site: { code: string; name: string } | null;
      }
    | null;
};

type ScoreRow = {
  total: number | null;
  period_start: string;
  period_end: string;
};

type TimeOffRow = {
  id: string;
  status: string;
  kind: string;
  start_date: string;
  end_date: string;
};

type Broadcast = {
  id: string;
  title: string;
  body: string;
  priority: string;
  created_at: string;
  sent_at: string | null;
};

type ClockEntry = {
  id: string;
  kind: "in" | "out";
  occurred_at: string;
};

function greeting(locale: Locale): string {
  const h = new Date().getHours();
  if (h < 12) return t("today.greeting.morning", locale);
  if (h < 18) return t("today.greeting.afternoon", locale);
  return t("today.greeting.evening", locale);
}

function contextLine(locale: Locale): string {
  const h = new Date().getHours();
  if (h < 7) return t("today.context.early", locale);
  if (h < 12) return t("today.context.morning", locale);
  if (h < 14) return t("today.context.noon", locale);
  if (h < 18) return t("today.context.afternoon", locale);
  if (h < 22) return t("today.context.evening", locale);
  return t("today.context.late", locale);
}

function formatDateLong(iso: string, locale: Locale): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(dateLocaleStr(locale), {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function timeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

export default async function MyTodayPage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const ABSENCE_REASON: Record<string, string> = {
    sick: t("absence.reason.sick", locale),
    family_emergency: t("absence.reason.family_emergency", locale),
    transport: t("absence.reason.transport", locale),
    other: t("absence.reason.other", locale),
  };

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const tomorrowISO = new Date(today.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;

  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name, weekly_hours, paid_holidays_days, manager_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = empRaw as
    | {
        id: string;
        full_name: string;
        weekly_hours: number | null;
        paid_holidays_days?: number | null;
        manager_id: string | null;
      }
    | null;

  const firstName =
    (profile.full_name ?? employee?.full_name ?? "").split(/\s+/)[0] || "";

  // Si pas employé actif → page d'accueil simple
  if (!employee) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting(locale)}{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-sm text-ink-2">
            {t("today.no_employee.title", locale)}
          </p>
        </div>
        <Card>
          <div className="p-6 text-sm text-ink-2">
            {t("today.no_employee.body", locale)}
          </div>
        </Card>
      </div>
    );
  }

  // Sites où l'employé est affecté (pour absence_call)
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("site_id")
    .eq("employee_id", employee.id)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const mySiteIds = Array.from(
    new Set(
      ((assignsRaw ?? []) as Array<{ site_id: string }>).map((a) => a.site_id),
    ),
  );

  // Parallélisation des fetchs.
  const [
    { data: lastEntryRaw },
    { data: todayShiftsRaw },
    { data: nextShiftsRaw },
    { data: reinforcementsRaw },
    { data: swapsRaw },
    { data: absencesRaw },
    { data: timeOffRaw },
    { data: availabilityRaw },
    { data: monthEvalRaw },
    { data: monthShiftsRaw },
    { data: monthClockSessionsRaw },
    { data: timeOffApprovedYearRaw },
    { data: broadcastsRaw },
    { data: activeBonusRaw },
  ] = await Promise.all([
    supabase
      .from("clock_entries")
      .select("id, kind, occurred_at")
      .eq("employee_id", employee.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select(
        "id, date, start_time, end_time, position, location, status, site_id, site:sites(code, name)",
      )
      .eq("employee_id", employee.id)
      .eq("date", todayISO)
      .order("start_time", { ascending: true }),
    supabase
      .from("shifts")
      .select(
        "id, date, start_time, end_time, position, location, status, site_id, site:sites(code, name)",
      )
      .eq("employee_id", employee.id)
      .gt("date", todayISO)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(3),
    supabase
      .from("reinforcement_requests")
      .select(
        "id, date, start_time, end_time, position, expires_at, site:sites(code, name)",
      )
      .eq("proposed_employee_id", employee.id)
      .eq("status", "sent_to_employee")
      .order("expires_at", { ascending: true })
      .limit(5),
    supabase
      .from("shift_swap_requests")
      .select(
        "id, reason, requester_employee_id, requester_shift_id",
      )
      .eq("target_employee_id", employee.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    mySiteIds.length > 0
      ? supabase
          .from("unplanned_absences")
          .select(
            `id, date, reason,
             shift:shifts(id, date, start_time, end_time, site_id, site:sites(code, name))`,
          )
          .neq("employee_id", employee.id)
          .in("status", ["reported", "unfilled"])
          .gte("date", todayISO)
          .lte("date", tomorrowISO)
          .order("date", { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] }),
    supabase
      .from("time_off_requests")
      .select("id, status, kind, start_date, end_date")
      .eq("employee_id", employee.id)
      .eq("status", "pending"),
    supabase
      .from("employee_unavailabilities")
      .select("id, created_at")
      .eq("employee_id", employee.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("evaluations")
      .select("total, period_start, period_end")
      .eq("employee_id", employee.id)
      .gte("period_end", monthStartISO)
      .order("period_end", { ascending: false }),
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, status")
      .eq("employee_id", employee.id)
      .gte("date", monthStartISO)
      .lte("date", todayISO),
    supabase
      .from("clock_sessions")
      .select("clock_in_at, duration_minutes")
      .eq("employee_id", employee.id)
      .gte("clock_in_at", `${monthStartISO}T00:00:00`),
    supabase
      .from("time_off_requests")
      .select("id, kind, status, start_date, end_date")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .gte("start_date", `${todayISO.slice(0, 4)}-01-01`)
      .lte("end_date", `${todayISO.slice(0, 4)}-12-31`),
    supabase
      .from("broadcasts")
      .select("id, title, body, priority, created_at, sent_at")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(3),
    // Concours en cours (visible par tous via policy bc_read).
    supabase
      .from("bonus_campaigns")
      .select("id, name, end_date, rule_kind")
      .eq("is_active", true)
      .lte("start_date", todayISO)
      .gte("end_date", todayISO)
      .limit(3),
  ]);

  const lastEntry = (lastEntryRaw as ClockEntry | null) ?? null;
  const isClockedIn = lastEntry?.kind === "in";

  const todayShifts = (todayShiftsRaw ?? []) as unknown as Shift[];
  const nextShifts = (nextShiftsRaw ?? []) as unknown as Shift[];
  const reinforcements = (reinforcementsRaw ?? []) as unknown as Reinforcement[];
  const swapsRowsRaw = (swapsRaw ?? []) as unknown as SwapRequestRaw[];
  // Hydrate les swaps : noms des collègues + détails du shift en 2 requêtes.
  let swaps: SwapRequest[] = [];
  if (swapsRowsRaw.length > 0) {
    const empIds = Array.from(
      new Set(swapsRowsRaw.map((r) => r.requester_employee_id)),
    );
    const shiftIds = Array.from(
      new Set(swapsRowsRaw.map((r) => r.requester_shift_id)),
    );
    const [{ data: empRows }, { data: shiftRows }] = await Promise.all([
      supabase.from("employees").select("id, full_name").in("id", empIds),
      supabase
        .from("shifts")
        .select(
          "id, date, start_time, end_time, site:sites(code, name)",
        )
        .in("id", shiftIds),
    ]);
    const empByName = new Map<string, string>();
    for (const e of (empRows ?? []) as Array<{ id: string; full_name: string }>) {
      empByName.set(e.id, e.full_name);
    }
    type ShiftSlim = {
      id: string;
      date: string;
      start_time: string;
      end_time: string;
      site: { code: string; name: string } | null;
    };
    const shiftById = new Map<string, ShiftSlim>();
    for (const s of (shiftRows ?? []) as unknown as ShiftSlim[]) {
      shiftById.set(s.id, s);
    }
    swaps = swapsRowsRaw.map((r) => {
      const sh = shiftById.get(r.requester_shift_id);
      return {
        id: r.id,
        reason: r.reason,
        requesterName: empByName.get(r.requester_employee_id) ?? null,
        shift: sh
          ? {
              date: sh.date,
              start_time: sh.start_time,
              end_time: sh.end_time,
              siteCode: sh.site?.code ?? null,
            }
          : null,
      };
    });
  }
  const absenceCalls = (absencesRaw ?? []) as unknown as AbsenceCall[];
  const timeOffPending = (timeOffRaw ?? []) as TimeOffRow[];
  const availability = (availabilityRaw ?? []) as Array<{
    id: string;
    created_at: string;
  }>;
  const monthEvals = (monthEvalRaw ?? []) as ScoreRow[];
  const monthShifts = (monthShiftsRaw ?? []) as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    status: string;
  }>;
  const monthSessions = (monthClockSessionsRaw ?? []) as Array<{
    clock_in_at: string;
    duration_minutes: number | null;
  }>;
  const timeOffApprovedYear = (timeOffApprovedYearRaw ?? []) as TimeOffRow[];
  const broadcasts = (broadcastsRaw ?? []) as Broadcast[];
  const activeBonus = (activeBonusRaw ?? []) as Array<{
    id: string;
    name: string;
    end_date: string;
    rule_kind: string;
  }>;

  const firstShiftToday = todayShifts[0] ?? null;

  // À faire
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekStartISO = weekStart.toISOString().slice(0, 10);
  const noAvailabilityThisWeek =
    !availability[0] || availability[0].created_at.slice(0, 10) < weekStartISO;
  const hasPendingTimeOff = timeOffPending.length > 0;
  const missedClockOut =
    isClockedIn &&
    lastEntry &&
    Date.now() - new Date(lastEntry.occurred_at).getTime() > 12 * 3600_000;

  // Stats du mois
  const planned =
    monthShifts.reduce((acc, s) => {
      const [sh, sm] = s.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = s.end_time.slice(0, 5).split(":").map(Number);
      const min = Math.max(0, eh * 60 + em - sh * 60 - sm - (s.break_minutes ?? 0));
      return acc + min / 60;
    }, 0) || 0;
  const clocked =
    monthSessions.reduce((acc, s) => acc + (s.duration_minutes ?? 0) / 60, 0) ||
    0;
  const monthScoreAvg =
    monthEvals.length > 0
      ? Math.round(
          (monthEvals.reduce((acc, e) => acc + (e.total ?? 0), 0) /
            monthEvals.length) *
            10,
        ) / 10
      : null;

  // Estimation jours de congé restants : budget annuel - utilisés.
  const budgetDays = employee.paid_holidays_days ?? 20;
  const usedDays = timeOffApprovedYear
    .filter((t) => t.kind === "vacation")
    .reduce((acc, tr) => {
      const start = new Date(tr.start_date).getTime();
      const end = new Date(tr.end_date).getTime();
      const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
      return acc + days;
    }, 0);
  const remainingDays = Math.max(0, budgetDays - usedDays);

  const urgentCount =
    reinforcements.length + swaps.length + absenceCalls.length;

  const publicVapid = getPublicVapidKey();

  return (
    <div className="space-y-4 max-w-4xl pb-safe">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          {greeting(locale)}, {firstName} 👋
        </h1>
        <p className="text-sm text-ink-2 mt-1">{contextLine(locale)}</p>
      </div>

      {/* CTA Pointage */}
      <Card>
        <div className="p-4 sm:p-5">
          {firstShiftToday && !isClockedIn ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-12 w-12 rounded-full bg-success-light text-success flex items-center justify-center shrink-0">
                <LogIn className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase font-bold tracking-wider text-ink-3">
                  {t("today.cta.shift_today", locale)}
                </div>
                <div className="font-bold text-base">
                  {timeRange(firstShiftToday.start_time, firstShiftToday.end_time)}
                  {firstShiftToday.site?.code
                    ? ` · ${t("common.site", locale)} ${firstShiftToday.site.code}`
                    : ""}
                  {firstShiftToday.position ? ` · ${firstShiftToday.position}` : ""}
                </div>
              </div>
              <Button
                asChild
                variant="gold"
                size="lg"
                className="bg-success hover:bg-success/90 text-white"
              >
                <Link href="/me/clock">
                  📍 {t("today.cta.clock_in", locale)}
                </Link>
              </Button>
            </div>
          ) : isClockedIn ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-12 w-12 rounded-full bg-danger-light text-danger flex items-center justify-center shrink-0">
                <LogOut className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase font-bold tracking-wider text-ink-3">
                  {t("today.cta.in_progress", locale)}
                </div>
                <div className="font-bold text-base">
                  <LiveDuration
                    since={lastEntry!.occurred_at}
                    className="font-mono"
                  />
                </div>
              </div>
              <Button
                asChild
                variant="gold"
                size="lg"
                className="bg-danger hover:bg-danger/90 text-white"
              >
                <Link href="/me/clock">🚪 {t("today.cta.clock_out", locale)}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-12 w-12 rounded-full bg-surface-2 text-ink-3 flex items-center justify-center shrink-0">
                <CalendarOff className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase font-bold tracking-wider text-ink-3">
                  {t("today.cta.no_shift_label", locale)}
                </div>
                <div className="font-bold text-base">
                  {t("today.cta.no_shift", locale)}
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/me/planning">
                  {t("today.cta.see_planning", locale)} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Push notifications CTA */}
      {publicVapid ? (
        <Card>
          <div className="p-3 flex items-center gap-3 flex-wrap">
            <div className="text-sm flex-1 min-w-0">
              <div className="font-bold">🔔 {t("today.activate_notifications.title", locale)}</div>
              <div className="text-xs text-ink-2">
                {t("today.activate_notifications.body", locale)}
              </div>
            </div>
            <PushEnableButton publicKey={publicVapid} compact />
          </div>
        </Card>
      ) : null}

      {/* Demandes urgentes pour moi */}
      {urgentCount > 0 ? (
        <Card>
          <div className="p-3 sm:p-4 border-b border-line flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-danger text-white text-xs font-bold">
              {urgentCount}
            </span>
            <h2 className="font-bold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-gold-dark" />
              {t("today.section.urgent_for_you", locale)}
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {reinforcements.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/me/reinforcement/${r.id}`}
                  className="block p-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">
                        {t("today.urgent.reinforcement_proposed", locale, { site: r.site?.name ?? t("today.urgent.site_default", locale) })}
                      </div>
                      <div className="text-xs text-ink-3">
                        {formatDateLong(r.date, locale)} · {timeRange(r.start_time, r.end_time)}
                        {r.position ? ` · ${r.position}` : ""}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3" />
                  </div>
                </Link>
              </li>
            ))}
            {swaps.map((s) => (
              <li key={s.id}>
                <Link
                  href="/me/swaps"
                  className="block p-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-8 w-8 rounded-md bg-info-light text-info flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">
                        {t("today.urgent.swap_proposed", locale, { who: s.requesterName ?? t("today.urgent.colleague", locale) })}
                      </div>
                      <div className="text-xs text-ink-3">
                        {s.shift
                          ? `${formatDateLong(s.shift.date, locale)} · ${timeRange(
                              s.shift.start_time,
                              s.shift.end_time,
                            )}${s.shift.siteCode ? ` · ${t("common.site", locale)} ${s.shift.siteCode}` : ""}`
                          : t("today.urgent.swap_fallback", locale)}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3" />
                  </div>
                </Link>
              </li>
            ))}
            {absenceCalls.map((a) => (
              <li key={a.id}>
                <Link
                  href="/me/absence"
                  className="block p-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-8 w-8 rounded-md bg-danger-light text-danger flex items-center justify-center shrink-0">
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">
                        {t("today.urgent.absence_to_cover", locale, { site: a.shift?.site?.code ? `${t("common.site", locale)} ${a.shift.site.code}` : t("today.urgent.site_default", locale) })}
                      </div>
                      <div className="text-xs text-ink-3">
                        {formatDateLong(a.date, locale)}
                        {a.shift
                          ? ` · ${timeRange(a.shift.start_time, a.shift.end_time)}`
                          : ""}
                        {ABSENCE_REASON[a.reason]
                          ? ` · ${ABSENCE_REASON[a.reason]}`
                          : ""}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mes prochains shifts */}
        <Card>
          <div className="p-3 sm:p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-gold-dark" />
              {t("today.section.next_shifts", locale)}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/me/planning">
                {t("common.see_all", locale)} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          {nextShifts.length === 0 ? (
            <div className="p-6 text-sm text-ink-3 text-center">
              {t("today.shifts.empty", locale)}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {nextShifts.map((s) => (
                <li
                  key={s.id}
                  className="p-3 flex items-center gap-3 text-sm"
                >
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 w-14 shrink-0">
                    {new Date(s.date + "T00:00:00").toLocaleDateString(dateLocaleStr(locale), {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </div>
                  <div className="font-mono text-xs flex-1">
                    {timeRange(s.start_time, s.end_time)}
                  </div>
                  <div className="text-xs text-ink-2 truncate max-w-[40%]">
                    {s.site?.code ? `${t("common.site", locale)} ${s.site.code}` : ""}
                    {s.position ? ` · ${s.position}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* À faire */}
        <Card>
          <div className="p-3 sm:p-4 border-b border-line flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-gold-dark" />
            <h2 className="font-bold">{t("today.section.todo", locale)}</h2>
          </div>
          <ul className="divide-y divide-line">
            {noAvailabilityThisWeek ? (
              <TodoItem
                href="/me/availability"
                label={t("today.todo.declare_availability", locale)}
                tone="warn"
              />
            ) : null}
            {hasPendingTimeOff ? (
              <TodoItem
                href="/me/time-off"
                label={t(
                  timeOffPending.length > 1 ? "today.todo.pending_leave_many" : "today.todo.pending_leave_one",
                  locale,
                  { n: timeOffPending.length },
                )}
                tone="info"
              />
            ) : null}
            {missedClockOut ? (
              <TodoItem
                href="/me/clock"
                label={t("today.todo.missing_clock_out", locale)}
                tone="danger"
              />
            ) : null}
            {!noAvailabilityThisWeek && !hasPendingTimeOff && !missedClockOut ? (
              <li className="p-4 text-sm text-ink-3 text-center">
                {t("today.todo.all_done", locale)} 👌
              </li>
            ) : null}
          </ul>
        </Card>

        {/* Mes stats du mois */}
        <Card>
          <div className="p-3 sm:p-4 border-b border-line flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-gold-dark" />
            <h2 className="font-bold">{t("today.section.month_stats", locale)}</h2>
          </div>
          <div className="p-3 grid grid-cols-3 gap-2">
            <Stat
              label={t("today.stat.hours_clocked", locale)}
              value={`${Math.round(clocked * 10) / 10} / ${Math.round(planned)}`}
              sub={t("today.stat.hours_clocked_sub", locale)}
            />
            <Stat
              label={t("today.stat.manager_score", locale)}
              value={monthScoreAvg != null ? monthScoreAvg.toFixed(1) : "—"}
              sub={t("today.stat.manager_score_sub", locale)}
            />
            <Stat
              label={t("today.stat.leave_remaining", locale)}
              value={`${remainingDays}${locale === "nl" ? "d" : "j"}`}
              sub={t("today.stat.leave_remaining_sub", locale)}
            />
          </div>
        </Card>

        {/* Mini-card concours actif */}
        {activeBonus.length > 0 ? (
          <Card>
            <div className="p-3 sm:p-4 border-b border-line flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-gold-dark" />
              <h2 className="font-bold">
                {locale === "nl" ? "Wedstrijden in uitvoering" : "Concours en cours"}
              </h2>
              <Link
                href="/me/my-bonus"
                className="ml-auto text-xs text-ink-3 hover:text-gold-dark inline-flex items-center gap-1"
              >
                {t("common.see_all", locale)} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {activeBonus.map((b) => (
                <li key={b.id}>
                  <Link
                    href="/me/my-bonus"
                    className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{b.name}</div>
                      <div className="text-xs text-ink-3">
                        {locale === "nl" ? "Tot" : "Jusqu'au"}{" "}
                        {new Date(b.end_date + "T00:00:00").toLocaleDateString(
                          locale === "nl" ? "nl-BE" : "fr-BE",
                          { day: "2-digit", month: "long" },
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Annonces direction */}
        <Card>
          <div className="p-3 sm:p-4 border-b border-line flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-gold-dark" />
            <h2 className="font-bold">{t("today.section.announcements", locale)}</h2>
          </div>
          {broadcasts.length === 0 ? (
            <div className="p-6 text-sm text-ink-3 text-center">
              {t("today.announcements.empty", locale)}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {broadcasts.map((b) => (
                <li key={b.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">📢 {b.title}</span>
                    {b.priority === "urgent" ? (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-danger-light text-danger">
                        {t("today.announcements.urgent", locale)}
                      </span>
                    ) : b.priority === "important" ? (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-warn-light text-warn">
                        {t("today.announcements.important", locale)}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-ink-3 ml-auto">
                      {new Date(b.sent_at ?? b.created_at).toLocaleDateString(
                        dateLocaleStr(locale),
                        { day: "2-digit", month: "short" },
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-ink-2 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                    {b.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function TodoItem({
  href,
  label,
  tone,
}: {
  href: string;
  label: string;
  tone: "warn" | "info" | "danger";
}) {
  const dot =
    tone === "danger"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-warn"
        : "bg-info";
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors text-sm"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
        <span className="flex-1 min-w-0">{label}</span>
        <ArrowRight className="h-3.5 w-3.5 text-ink-3" />
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5 text-center">
      <div className="text-[9px] uppercase tracking-wider font-bold text-ink-3 leading-tight">
        {label}
      </div>
      <div className="text-base sm:text-lg font-extrabold font-mono mt-1 leading-none">
        {value}
      </div>
      <div className="text-[10px] text-ink-3 mt-0.5">{sub}</div>
    </div>
  );
}
