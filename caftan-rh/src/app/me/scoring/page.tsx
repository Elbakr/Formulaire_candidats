import { Star, FileBarChart, TrendingUp, TrendingDown, Minus, CalendarX2, ShieldCheck } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/utils";
import { startOfWeek, addDays, toISODate } from "@/lib/planning";
import { getLocale } from "@/lib/locale-server";
import { t, type TranslationKey } from "@/lib/i18n";
import { loadValidationReliabilityForEmployees } from "@/lib/scoring/validation-reliability";

// 7 axes Discovery (recrutement.html EVAL_CRIT)
const SCORE_AXES: Array<[string, TranslationKey]> = [
  ["ponctualite", "scoring.axis.ponctualite"],
  ["presentation", "scoring.axis.presentation"],
  ["communication", "scoring.axis.communication"],
  ["motivation", "scoring.axis.motivation"],
  ["experience", "scoring.axis.experience"],
  ["polyvalence", "scoring.axis.polyvalence"],
  ["disponibilite", "scoring.axis.disponibilite"],
];

export default async function MyScoringPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, job_title")
    .eq("profile_id", user.id)
    .maybeSingle();
  const employee = emp as unknown as { id: string; full_name: string; job_title: string | null } | null;

  if (!employee) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("scoring.title", locale)}</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <FileBarChart className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">{t("scoring.no_employee", locale)}</p>
          </div>
        </Card>
      </div>
    );
  }

  const today = new Date();
  const monday = startOfWeek(today);
  const twelveWeeksBack = toISODate(addDays(monday, -84));
  const sixtyDaysBack = toISODate(addDays(today, -60));

  const [{ data: scoreRow }, { data: evals }, { data: weeklyRatings }, { data: absencesRaw }, reliabilityMap] = await Promise.all([
    supabase.from("employee_scores").select("*").eq("employee_id", employee.id).single(),
    supabase
      .from("evaluations")
      .select("id, period_start, period_end, scores, total, comment, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("weekly_employee_ratings")
      .select("week_monday, rating")
      .eq("employee_id", employee.id)
      .gte("week_monday", twelveWeeksBack)
      .order("week_monday", { ascending: true }),
    supabase
      .from("unplanned_absences")
      .select("id, date, reason, status")
      .eq("employee_id", employee.id)
      .gte("date", sixtyDaysBack)
      .order("date", { ascending: false }),
    loadValidationReliabilityForEmployees([employee.id], 6),
  ]);

  const weekly = (weeklyRatings ?? []) as Array<{ week_monday: string; rating: number }>;
  const last4 = weekly.slice(-4);
  const prev4 = weekly.slice(-8, -4);
  const avg = (a: typeof weekly) => (a.length ? a.reduce((s, x) => s + x.rating, 0) / a.length : null);
  const last4Avg = avg(last4);
  const prev4Avg = avg(prev4);
  let trendIcon: "up" | "down" | "flat" = "flat";
  if (last4Avg != null && prev4Avg != null) {
    const d = last4Avg - prev4Avg;
    if (d > 0.3) trendIcon = "up";
    else if (d < -0.3) trendIcon = "down";
  }

  const r = scoreRow as unknown as {
    reliability_pct: number | null;
    coverage_pct: number | null;
    shifts_total: number | null;
    shifts_done: number | null;
    time_off_days_12m: number | null;
    global_score: number | null;
    avg_manager_score: number | null;
  } | null;

  const evaluations = (evals ?? []) as unknown as Array<{
    id: string;
    period_start: string;
    period_end: string;
    scores: Record<string, number>;
    total: number;
    comment: string | null;
    created_at: string;
  }>;

  // --- Absences imprévues 60 jours ---
  const absences = (absencesRaw ?? []) as Array<{ id: string; date: string; reason: string | null; status: string | null }>;
  const absenceCount = absences.length;
  // 15 pts de pénalité par absence, borné 0-100
  const absenceScore = Math.max(0, Math.min(100, 100 - absenceCount * 15));
  type AbsenceBand = "exemplary" | "ok" | "attention" | "danger";
  function absenceBand(score: number): AbsenceBand {
    if (score >= 95) return "exemplary";
    if (score >= 70) return "ok";
    if (score >= 40) return "attention";
    return "danger";
  }
  const absScoreBand = absenceBand(absenceScore);

  // --- Fiabilité post-validation ---
  const reliability = reliabilityMap.get(employee.id) ?? null;

  // Couleurs par bande
  const bandColors: Record<string, { bg: string; text: string }> = {
    exemplary: { bg: "bg-success-light", text: "text-success" },
    ok: { bg: "bg-info-light", text: "text-info" },
    attention: { bg: "bg-warn-light", text: "text-warn" },
    danger: { bg: "bg-danger-light", text: "text-danger" },
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("scoring.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("scoring.subtitle", locale)}</p>
      </div>

      <Card>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">{t("scoring.global_score", locale)}</div>
            <div className="text-4xl font-extrabold font-mono text-gold-dark">
              {Number(r?.global_score ?? 0).toFixed(0)}
              <span className="text-base text-ink-3 font-normal">/100</span>
            </div>
          </div>
          {r?.avg_manager_score != null ? (
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">{t("scoring.manager_avg", locale)}</div>
              <div className="text-2xl font-extrabold font-mono flex items-center gap-1">
                <Star className="h-5 w-5 fill-gold text-gold" />
                {Number(r.avg_manager_score).toFixed(1)}<span className="text-sm text-ink-3 font-normal">/5</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="border-t border-line p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={t("scoring.reliability", locale)} value={`${Number(r?.reliability_pct ?? 100).toFixed(0)}%`} />
          <Stat label={t("scoring.coverage", locale)} value={`${Number(r?.coverage_pct ?? 100).toFixed(0)}%`} />
          <Stat label={t("scoring.shifts_12m", locale)} value={`${r?.shifts_done ?? 0} / ${r?.shifts_total ?? 0}`} />
          <Stat label={t("scoring.leave_days", locale)} value={`${r?.time_off_days_12m ?? 0}`} />
        </div>
      </Card>

      {/* ── Absences imprévues 60 jours ── */}
      <Card>
        <div className="p-4 border-b border-line flex items-center gap-2">
          <CalendarX2 className="h-4 w-4 text-ink-3 shrink-0" />
          <div>
            <h2 className="font-bold">{t("scoring.absences.title", locale)}</h2>
            <p className="text-xs text-ink-3 mt-0.5">{t("scoring.absences.hint", locale)}</p>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="bg-surface-2 rounded-md p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{t("scoring.absences.score_label", locale)}</div>
            <div className="text-3xl font-extrabold font-mono mt-1 text-gold-dark">
              {absenceScore.toFixed(0)}<span className="text-sm text-ink-3 font-normal">/100</span>
            </div>
            <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${bandColors[absScoreBand].bg} ${bandColors[absScoreBand].text}`}>
              {t(`scoring.absences.band.${absScoreBand}`, locale)}
            </span>
          </div>
          <div className="bg-surface-2 rounded-md p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{t("scoring.absences.count_label", locale)}</div>
            <div className="text-3xl font-extrabold font-mono mt-1">
              {absenceCount}
            </div>
            <p className="text-xs text-ink-2 mt-1">
              {absenceCount === 0
                ? t("scoring.absences.count_zero", locale)
                : absenceCount === 1
                ? t("scoring.absences.count_one", locale, { n: absenceCount })
                : t("scoring.absences.count_many", locale, { n: absenceCount })}
            </p>
          </div>
        </div>
        {absences.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {absences.map((ab) => (
              <li key={ab.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-ink-3 font-mono text-xs w-24 shrink-0">{formatDate(ab.date)}</span>
                <span className="text-ink-2 truncate">{ab.reason ?? "—"}</span>
                {ab.status && (
                  <span className="ml-auto text-[10px] uppercase font-bold text-ink-3 shrink-0">{ab.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Fiabilité post-validation ── */}
      <Card>
        <div className="p-4 border-b border-line flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ink-3 shrink-0" />
          <div>
            <h2 className="font-bold">{t("scoring.reliability_detail.title", locale)}</h2>
            <p className="text-xs text-ink-3 mt-0.5">{t("scoring.reliability_detail.hint", locale)}</p>
          </div>
        </div>
        {reliability == null || (reliability.accepted === 0 && reliability.cancelled_after_validation === 0 && reliability.refused === 0) ? (
          <div className="p-6 text-center text-sm text-ink-3">{t("scoring.reliability_detail.no_data", locale)}</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-2 rounded-md p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{t("scoring.reliability_detail.score_label", locale)}</div>
                <div className="text-3xl font-extrabold font-mono mt-1 text-gold-dark">
                  {reliability.score.toFixed(0)}<span className="text-sm text-ink-3 font-normal">/100</span>
                </div>
                <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${bandColors[reliability.band].bg} ${bandColors[reliability.band].text}`}>
                  {t(`scoring.reliability_detail.band.${reliability.band}`, locale)}
                </span>
              </div>
              <div className="bg-surface-2 rounded-md p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{t("scoring.reliability_detail.honored_label", locale)}</div>
                <div className="text-3xl font-extrabold font-mono mt-1">
                  {reliability.honored_pct.toFixed(0)}<span className="text-sm text-ink-3 font-normal">%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t("scoring.reliability_detail.accepted", locale)} value={String(reliability.accepted)} />
              <Stat label={t("scoring.reliability_detail.cancelled", locale)} value={String(reliability.cancelled_after_validation)} />
              <Stat label={t("scoring.reliability_detail.refused", locale)} value={String(reliability.refused)} />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">{t("scoring.progression", locale)}</h2>
          <p className="text-xs text-ink-3 mt-0.5">{t("scoring.progression_hint", locale)}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">{t("scoring.last_4_avg", locale)}</div>
              <div className="text-3xl font-extrabold font-mono mt-0.5 flex items-center gap-2">
                {last4Avg != null ? (
                  <>
                    <Star className="h-6 w-6 fill-gold text-gold" />
                    {last4Avg.toFixed(1)}<span className="text-base text-ink-3 font-normal">/5</span>
                  </>
                ) : (
                  <span className="text-base text-ink-3 font-normal">{t("scoring.not_yet_rated", locale)}</span>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-ink-3">{t("scoring.trend", locale)}</span>
              {trendIcon === "up" ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success-light text-success text-xs font-bold">
                  <TrendingUp className="h-3.5 w-3.5" /> {t("scoring.trend.up", locale)}
                </span>
              ) : trendIcon === "down" ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-danger-light text-danger text-xs font-bold">
                  <TrendingDown className="h-3.5 w-3.5" /> {t("scoring.trend.down", locale)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-info-light text-info text-xs font-bold">
                  <Minus className="h-3.5 w-3.5" /> {t("scoring.trend.flat", locale)}
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3 mb-2">{t("scoring.last_12_weeks", locale)}</div>
            <div className="flex items-end gap-1 h-16">
              {Array.from({ length: 12 }, (_, i) => {
                const weekStart = toISODate(addDays(monday, -((11 - i) * 7)));
                const wr = weekly.find((w) => w.week_monday === weekStart);
                const v = wr?.rating ?? 0;
                const heightPct = v > 0 ? (v / 5) * 100 : 6;
                const cls =
                  v >= 4
                    ? "bg-success"
                    : v >= 3
                    ? "bg-gold"
                    : v >= 2
                    ? "bg-warn"
                    : v >= 1
                    ? "bg-danger"
                    : "bg-line";
                return (
                  <div
                    key={weekStart}
                    title={`${weekStart} : ${v}/5`}
                    className="flex-1 rounded-sm transition-all"
                    style={{ height: `${heightPct}%`, minHeight: "4px" }}
                  >
                    <div className={`h-full w-full rounded-sm ${cls}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">{t("scoring.evaluations", locale)}</h2>
        </div>
        {evaluations.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">{t("scoring.no_evaluations", locale)}</div>
        ) : (
          <ul className="divide-y divide-line">
            {evaluations.map((e) => (
              <li key={e.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Star className="h-4 w-4 fill-gold text-gold" />
                  <span className="font-bold text-sm">{Number(e.total).toFixed(1)} / 5</span>
                  <span className="text-xs text-ink-3">·</span>
                  <span className="text-xs text-ink-3">
                    {t("scoring.period", locale, { start: formatDate(e.period_start), end: formatDate(e.period_end) })}
                  </span>
                  <span className="text-xs text-ink-3 ml-auto">{formatDateTime(e.created_at)}</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-xs">
                  {SCORE_AXES.map(([k, label]) => (
                    <div key={k} className="bg-surface-2 rounded p-1.5 text-center">
                      <div className="text-[9px] text-ink-3 uppercase font-bold truncate">{t(label, locale)}</div>
                      <div className="font-mono font-bold">{e.scores?.[k] ?? "—"}</div>
                    </div>
                  ))}
                </div>
                {e.comment ? <p className="mt-2 text-xs text-ink-2 italic">&quot;{e.comment}&quot;</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-base font-bold font-mono mt-0.5">{value}</div>
    </div>
  );
}
