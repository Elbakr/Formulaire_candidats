// Karim 2026-05-22 : refacto pour mutualiser les queries. Reçoit les
// donnees en props depuis page.tsx (1 seul chargement parent au lieu de
// 5 queries propres). Composant SYNCHRONE.

import Link from "next/link";
import {
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Calendar,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { addDays, toISODate, parseISODate, startOfWeek, weekRange, shiftHours } from "@/lib/planning";
import type { SiteAnalyticsData } from "./site-analytics-loader";

export function SiteStatsPanel({
  data,
  weekISO,
}: {
  data: SiteAnalyticsData;
  weekISO: string;
}) {
  const site = data.site;
  if (!site) return null;
  const monday = startOfWeek(parseISODate(weekISO));

  const employees = data.members;
  const seenEmpIds = data.memberIds;

  const totalEmployees = employees.length;
  const totalQuota = employees.reduce((acc, e) => acc + (e.weekly_hours ?? 38), 0);

  function netHours(s: { start_time: string; end_time: string; break_minutes: number }): number {
    return shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0);
  }
  const shifts = data.shiftsOnSite;
  const hoursAtSiteContract = shifts
    .filter((s) => !s.is_overtime)
    .reduce((acc, s) => acc + netHours(s), 0);
  const hoursAtSiteOT = shifts
    .filter((s) => s.is_overtime)
    .reduce((acc, s) => acc + netHours(s), 0);
  const totalShifts = shifts.length;

  const needs = data.needs;
  let totalReq = 0;
  let totalAct = 0;
  let missingTotal = 0;
  let criticalUncovered = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const jsDow = d.getDay();
    const dISO = toISODate(d);
    const dayNeeds = needs.filter((n) => n.day_of_week === jsDow);
    const reqHc = dayNeeds.reduce((a, n) => a + n.headcount, 0);
    const actHc = shifts.filter((s) => s.date === dISO).length;
    totalReq += reqHc;
    totalAct += actHc;
    const missingDay = Math.max(0, reqHc - actHc);
    missingTotal += missingDay;
    if (missingDay > 0 && dayNeeds.some((n) => (n.is_critical ?? 0) >= 1)) {
      criticalUncovered += missingDay;
    }
  }
  const coveragePct = totalReq > 0 ? Math.round((Math.min(totalAct, totalReq) / totalReq) * 100) : 100;

  const leaves = data.leaves;
  const empOnLeave = new Set(leaves.map((l) => l.employee_id));
  const onLeaveCount = [...empOnLeave].filter((id) => seenEmpIds.has(id)).length;

  const fmtAbbr = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  };
  const empNameById = new Map(employees.map((e) => [e.id, e.full_name] as const));
  const onLeaveDetails = leaves
    .filter((l) => seenEmpIds.has(l.employee_id))
    .map((l) => ({
      name: empNameById.get(l.employee_id) ?? "?",
      kind: l.kind,
      from: fmtAbbr(l.start_date),
      to: l.end_date >= "9000-01-01" ? "∞" : fmtAbbr(l.end_date),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hoursByEmp = new Map<string, number>();
  for (const s of shifts) {
    hoursByEmp.set(s.employee_id, (hoursByEmp.get(s.employee_id) ?? 0) + netHours(s));
  }
  let underUtil = 0;
  let overUtil = 0;
  let saturated = 0;
  for (const e of employees) {
    const used = hoursByEmp.get(e.id) ?? 0;
    const tgt = e.weekly_hours ?? 38;
    const pct = tgt > 0 ? used / tgt : 0;
    if (pct < 0.5) underUtil += 1;
    else if (pct > 1.0) overUtil += 1;
    else if (pct >= 0.9) saturated += 1;
  }

  const covTone =
    coveragePct >= 100 ? "bg-success text-white" :
    coveragePct >= 70 ? "bg-gold text-[#1a1a0d]" :
    coveragePct >= 30 ? "bg-warn text-white" :
    "bg-danger text-white";

  return (
    <Card>
      <div
        className="px-4 py-2 border-b border-line flex items-center gap-2"
        style={{ backgroundColor: site.light_color ?? undefined }}
      >
        <span
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-white font-bold text-xs shrink-0"
          style={{ backgroundColor: site.color ?? "#666" }}
        >
          {site.code}
        </span>
        <div className="text-sm font-bold">{site.name}</div>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-3 font-bold">
          KPI semaine
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Effectif actif"
          value={`${totalEmployees}`} hint={`${totalQuota}h contractuel total`}
          href={`/planning/sites/${site.code}#equipe`} />
        <Stat icon={<Calendar className="h-3.5 w-3.5" />} label="Couverture"
          value={`${coveragePct}%`} hint={`${totalAct}/${totalReq} créneaux`}
          tone={covTone} href={`/planning/sites/${site.code}?week=${weekISO}`} />
        <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Heures planifiées"
          value={`${hoursAtSiteContract.toFixed(0)}h`}
          hint={hoursAtSiteOT > 0 ? `+ ${hoursAtSiteOT.toFixed(0)}h sup` : "0 h. sup"}
          tone={hoursAtSiteOT > 0 ? "bg-orange-100 text-orange-700" : undefined}
          href={`/planning/quotas?period=this_week`} />
        <Stat icon={<Calendar className="h-3.5 w-3.5" />} label="Shifts créés"
          value={`${totalShifts}`} hint={`${shifts.filter((s) => s.is_overtime).length} OT`}
          href={`/planning/sites/${site.code}?week=${weekISO}`} />
        <Stat icon={missingTotal > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          label="Créneaux manquants"
          value={missingTotal > 0 ? `−${missingTotal}` : "✓ 0"}
          hint={criticalUncovered > 0 ? `${criticalUncovered} critique${criticalUncovered > 1 ? "s" : ""}` : "rien de critique"}
          tone={missingTotal === 0 ? "bg-success-light text-success" : criticalUncovered > 0 ? "bg-danger text-white" : "bg-warn-light text-warn"}
          href={`/planning/sites/${site.code}?week=${weekISO}`} />
        <Stat icon={<TrendingDown className="h-3.5 w-3.5" />} label="Sous-utilisés"
          value={`${underUtil}`} hint="< 50 % quota cette sem."
          tone={underUtil > 0 ? "bg-warn-light text-warn" : undefined}
          href={`/planning/quotas?period=this_week`} />
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Saturés / OT"
          value={`${saturated} / ${overUtil}`} hint="quota 90-100% / >100%"
          tone={overUtil > 0 ? "bg-orange-100 text-orange-700" : undefined}
          href={`/planning/quotas?period=this_week`} />
        <Stat icon={<Flame className="h-3.5 w-3.5" />} label="En congé"
          value={`${onLeaveCount}`} hint={onLeaveCount > 0 ? "cette semaine" : "personne"}
          tone={onLeaveCount > 0 ? "bg-info-light text-info" : undefined}
          extra={onLeaveDetails.length > 0 ? (
            <ul className="space-y-px font-mono">
              {onLeaveDetails.slice(0, 4).map((l, i) => (
                <li key={i} className="truncate">
                  {l.name.split(" ")[0]} <span className="opacity-70">{l.from}→{l.to}</span>
                </li>
              ))}
              {onLeaveDetails.length > 4 ? <li className="opacity-70 italic">+{onLeaveDetails.length - 4} autre(s)</li> : null}
            </ul>
          ) : null} />
      </div>
    </Card>
  );
}

function Stat({ icon, label, value, hint, tone, href, extra }: {
  icon: React.ReactNode; label: string; value: string; hint?: string;
  tone?: string; href?: string; extra?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 opacity-90">
        {icon} {label}
      </div>
      <div className="text-lg font-bold leading-tight mt-0.5">{value}</div>
      {hint ? <div className="text-[10px] opacity-80 leading-tight">{hint}</div> : null}
      {extra ? <div className="mt-1 text-[9px] leading-tight opacity-90">{extra}</div> : null}
    </>
  );
  const base = `rounded-md border border-line p-2 ${tone ?? "bg-surface"}`;
  if (href) {
    return (
      <Link href={href} className={`${base} hover:ring-2 hover:ring-gold/40 transition-shadow cursor-pointer block`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
