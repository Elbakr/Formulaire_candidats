import Link from "next/link";
import { AlertCircle, Clock, MapPin } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClockBigButton } from "./big-button";
import {
  loadEmployeeSites,
  loadRecentSessions,
  pickDefaultSiteId,
  formatDurationMin,
} from "@/lib/clock";
import { getLocale } from "@/lib/locale-server";
import { t, dateLocaleStr } from "@/lib/i18n";

export default async function MyClockPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = emp as unknown as { id: string; full_name: string } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("clock.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <AlertCircle className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              {t("clock.no_employee", locale)}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  const [{ data: shifts }, { data: lastEntry }, sessions, sites, def, { data: orgRow }] =
    await Promise.all([
      supabase
        .from("shifts")
        .select("id, date, start_time, end_time, position, location, status, site_id")
        .eq("employee_id", employee.id)
        .eq("date", today)
        .order("start_time", { ascending: true }),
      supabase
        .from("clock_entries")
        .select("id, kind, occurred_at, site_id")
        .eq("employee_id", employee.id)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadRecentSessions(employee.id, 7),
      loadEmployeeSites(employee.id),
      pickDefaultSiteId(employee.id),
      supabase
        .from("org_settings")
        .select("clock_geofence_strict, clock_require_selfie")
        .eq("id", 1)
        .maybeSingle(),
    ]);
  const orgRowTyped = (orgRow as {
    clock_geofence_strict?: boolean | null;
    clock_require_selfie?: boolean | null;
  } | null) ?? null;
  const geofenceStrict = orgRowTyped?.clock_geofence_strict !== false;
  const selfieRequired = orgRowTyped?.clock_require_selfie !== false;

  const todayShifts = (shifts ?? []) as unknown as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    location: string | null;
    status: string;
    site_id: string | null;
  }>;
  const last = lastEntry as
    | { id: string; kind: "in" | "out"; occurred_at: string; site_id: string | null }
    | null;
  const isClockedIn = last?.kind === "in";

  const defaultSite = def.siteId
    ? sites.find((s) => s.id === def.siteId) ?? null
    : null;

  const todayShift = todayShifts[0]
    ? {
        start: todayShifts[0].start_time.slice(0, 5),
        end: todayShifts[0].end_time.slice(0, 5),
      }
    : null;

  const sessionSiteIds = Array.from(
    new Set(sessions.map((s) => s.site_id).filter(Boolean) as string[]),
  );
  const { data: siteMetaRaw } =
    sessionSiteIds.length > 0
      ? await supabase
          .from("sites")
          .select("id, code, color")
          .in("id", sessionSiteIds)
      : { data: [] };
  const siteMeta = new Map<string, { code: string; color: string | null }>();
  for (const s of (siteMetaRaw ?? []) as Array<{
    id: string;
    code: string;
    color: string | null;
  }>) {
    siteMeta.set(s.id, { code: s.code, color: s.color });
  }

  return (
    <div className="space-y-4 max-w-2xl pb-safe">
      <div>
        <h1 className="text-2xl font-bold">{t("clock.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("clock.subtitle", locale)}</p>
      </div>

      <Card>
        <div className="p-5 sm:p-6">
          <ClockBigButton
            isClockedIn={isClockedIn}
            clockInAt={isClockedIn ? last?.occurred_at ?? null : null}
            defaultSite={defaultSite}
            availableSites={sites}
            todayShift={todayShift}
            geofenceStrict={geofenceStrict}
            selfieRequired={selfieRequired}
            userId={user.id}
            locale={locale}
          />
        </div>
      </Card>

      {todayShift ? (
        <Card>
          <div className="p-3 flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-gold-dark" />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                {t("clock.shift_planned_today", locale)}
              </div>
              <div className="font-bold">
                {todayShift.start} – {todayShift.end}
                {todayShifts[0].position ? ` · ${todayShifts[0].position}` : ""}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">
              {todayShifts[0].status}
            </span>
          </div>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-danger text-danger hover:bg-danger-light"
        >
          <Link href="/me/absence">
            <AlertCircle className="h-3.5 w-3.5" /> {t("clock.report_absence", locale)}
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">{t("clock.last_7_days", locale)}</h2>
        </div>
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            {t("clock.no_recent", locale)}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.slice(0, 14).map((s) => {
              const meta = s.site_id ? siteMeta.get(s.site_id) ?? null : null;
              const inDate = new Date(s.clock_in_at);
              return (
                <li
                  key={s.in_entry_id}
                  className="p-3 flex items-center gap-3 text-sm"
                >
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 w-12 shrink-0">
                    {inDate.toLocaleDateString(dateLocaleStr(locale), {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </div>
                  <div
                    className="inline-flex items-center justify-center rounded text-white text-[10px] font-bold w-7 h-7 shrink-0"
                    style={{ backgroundColor: meta?.color ?? "#999" }}
                    title={meta?.code ?? "—"}
                  >
                    {meta?.code ?? <MapPin className="h-3 w-3" />}
                  </div>
                  <div className="font-mono text-xs flex-1">
                    {inDate.toLocaleTimeString(dateLocaleStr(locale), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" → "}
                    {s.clock_out_at ? (
                      new Date(s.clock_out_at).toLocaleTimeString(dateLocaleStr(locale), {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="text-success font-bold">{t("clock.in_progress_short", locale)}</span>
                    )}
                  </div>
                  <div className="text-xs font-bold tabular-nums">
                    {s.duration_minutes != null
                      ? formatDurationMin(s.duration_minutes)
                      : "—"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
