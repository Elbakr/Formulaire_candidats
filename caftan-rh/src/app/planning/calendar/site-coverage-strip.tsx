// Server component : strip horizontal avec couverture %/manque par site
// sur la semaine en cours. Visible en haut du Planning semaine.
// Karim 19/05 : 'info cruciale sur laquelle tout repose'.

import Link from "next/link";
import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { weekRange, parseISODate, startOfWeek, addDays, toISODate } from "@/lib/planning";

export async function SiteCoverageStrip({ weekISO }: { weekISO: string }) {
  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);
  const supabase = await createClient();

  const [{ data: sitesRaw }, { data: needsRaw }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, color, abbr")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, headcount, is_critical, is_enabled")
      .eq("is_enabled", true),
    supabase
      .from("shifts")
      .select("site_id, date")
      .gte("date", start)
      .lte("date", end),
  ]);

  const sites = (sitesRaw ?? []) as Array<{
    id: string; code: string; name: string; color: string | null; abbr: string | null;
  }>;
  const needs = (needsRaw ?? []) as Array<{
    site_id: string; day_of_week: number; headcount: number; is_critical: number; is_enabled: boolean;
  }>;
  const shifts = (shiftsRaw ?? []) as Array<{ site_id: string | null; date: string }>;

  // Pour chaque site : agrege sur les 7 jours
  const stats = sites.map((site) => {
    let totalReq = 0;
    let totalAct = 0;
    let totalMissing = 0;
    let maxCritical = 0;
    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(monday, i);
      const dISO = toISODate(dayDate);
      const dayJsDow = dayDate.getDay(); // 0=dim
      const dayNeeds = needs.filter((n) => n.site_id === site.id && n.day_of_week === dayJsDow);
      const requiredHeadcount = dayNeeds.reduce((acc, n) => acc + n.headcount, 0);
      const actualHeadcount = shifts.filter((s) => s.site_id === site.id && s.date === dISO).length;
      totalReq += requiredHeadcount;
      totalAct += actualHeadcount;
      totalMissing += Math.max(0, requiredHeadcount - actualHeadcount);
      for (const n of dayNeeds) {
        if (n.is_critical > maxCritical) maxCritical = n.is_critical;
      }
    }
    const pct = totalReq > 0 ? Math.round((Math.min(totalAct, totalReq) / totalReq) * 100) : 100;
    const tone =
      totalReq === 0 ? "bg-ink-3/20 text-ink-3 border-line"
        : pct >= 100 ? "bg-success-light text-success border-success/40"
        : pct >= 70 ? "bg-gold-light text-gold-dark border-gold/40"
        : pct >= 30 ? "bg-warn-light text-warn border-warn/40"
        : "bg-danger-light text-danger border-danger/40";
    return { site, totalReq, totalAct, totalMissing, pct, tone, maxCritical };
  });

  const overall = stats.reduce(
    (acc, s) => {
      acc.req += s.totalReq;
      acc.act += s.totalAct;
      acc.miss += s.totalMissing;
      return acc;
    },
    { req: 0, act: 0, miss: 0 },
  );
  const overallPct = overall.req > 0 ? Math.round((Math.min(overall.act, overall.req) / overall.req) * 100) : 100;

  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> Couverture besoins par site (semaine)
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold">Global :</span>
          <span className={`px-2 py-0.5 rounded font-bold ${
            overallPct >= 100 ? "bg-success text-white"
              : overallPct >= 70 ? "bg-gold text-[#1a1a0d]"
              : overallPct >= 30 ? "bg-warn text-white"
              : "bg-danger text-white"
          }`}>
            {overall.act}/{overall.req} · {overallPct}%
          </span>
          {overall.miss > 0 ? (
            <span className="text-danger font-bold">−{overall.miss} manque{overall.miss > 1 ? "nt" : ""}</span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {stats.map((s) => (
          <Link
            key={s.site.id}
            href={`/planning/sites/${s.site.code}?week=${weekISO}`}
            className={`flex items-center gap-2 px-2 py-1.5 rounded border ${s.tone} hover:opacity-80 transition-opacity`}
            title={`${s.site.name}${s.totalMissing > 0 ? ` · ${s.totalMissing} créneaux manquants` : " · tout couvert"}`}
          >
            <span
              className="inline-flex items-center justify-center h-6 w-6 rounded text-white font-bold text-[10px] shrink-0"
              style={{ backgroundColor: s.site.color ?? "#666" }}
            >
              {s.site.abbr ?? s.site.code}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{s.site.name}</div>
              <div className="text-[10px] flex items-center gap-1">
                {s.totalReq === 0 ? (
                  <span>aucun besoin</span>
                ) : (
                  <>
                    <span className="font-mono font-bold">{s.totalAct}/{s.totalReq}</span>
                    <span>· {s.pct}%</span>
                    {s.totalMissing > 0 ? (
                      <span className="ml-auto inline-flex items-center gap-0.5 font-bold">
                        <AlertTriangle className="h-2.5 w-2.5" /> −{s.totalMissing}
                      </span>
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5 ml-auto" />
                    )}
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
