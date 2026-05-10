// Sites detail — table view : per department, current week scheduled hours,
// last week actual hours (also from `shifts`, which are treated as worked once
// past), coverage %, top employee.
//
// Click a row → /planning/calendar?week=<monday>.
// (The calendar page accepts only `week`, so we don't pass dept.)

import Link from "next/link";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startOfWeek, addDays, toISODate } from "@/lib/planning";
import {
  computeCoverage,
  bandLabel,
  sumHours,
  type DepartmentRow,
  type EmployeeRow,
  type ShiftRow,
} from "@/lib/analytics/coverage";

export default async function AnalyticsSitesPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const now = new Date();
  const monday = startOfWeek(now);
  const lastMonday = addDays(monday, -7);
  const curStart = toISODate(monday);
  const curEnd = toISODate(addDays(monday, 6));
  const prevStart = toISODate(lastMonday);
  const prevEnd = toISODate(addDays(lastMonday, 6));

  const [
    deptsRes,
    empsRes,
    curShiftsRes,
    prevShiftsRes,
    scoresRes,
  ] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("employees")
      .select("id, full_name, department_id, weekly_hours, status")
      .eq("status", "active"),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", curStart)
      .lte("date", curEnd),
    supabase
      .from("shifts")
      .select("employee_id, date, start_time, end_time, break_minutes")
      .gte("date", prevStart)
      .lte("date", prevEnd),
    supabase
      .from("employee_scores")
      .select("employee_id, full_name, department_name, global_score")
      .eq("status", "active")
      .order("global_score", { ascending: false }),
  ]);

  const departments = (deptsRes.data ?? []) as unknown as DepartmentRow[];
  const employees = (empsRes.data ?? []) as unknown as Array<EmployeeRow & { full_name: string }>;
  const curShifts = (curShiftsRes.data ?? []) as unknown as ShiftRow[];
  const prevShifts = (prevShiftsRes.data ?? []) as unknown as ShiftRow[];
  const scores = (scoresRes.data ?? []) as unknown as Array<{
    employee_id: string; full_name: string; department_name: string | null; global_score: number | null;
  }>;

  // Build current-week coverage (same helper as the main page)
  const coverage = computeCoverage(departments, employees, curShifts);

  // Last-week actual hours per dept
  const empById = new Map(employees.map((e) => [e.id, e]));
  const actualByDept = new Map<string, number>();
  for (const s of prevShifts) {
    const e = empById.get(s.employee_id);
    if (!e) continue;
    const k = e.department_id ?? "__none__";
    actualByDept.set(k, (actualByDept.get(k) ?? 0) + sumHours([s]));
  }

  // Top employee per dept
  const topByDept = new Map<string, { full_name: string; score: number }>();
  for (const s of scores) {
    // department_name is the only join field on the view, not id — fall back to first match.
    const k = s.department_name ?? "__none__";
    if (!topByDept.has(k)) topByDept.set(k, { full_name: s.full_name, score: Number(s.global_score ?? 0) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Détail par site</h1>
          <p className="text-sm text-ink-2">
            Semaine en cours · planifié {curStart} → {curEnd}. Semaine passée : {prevStart} → {prevEnd}.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/analytics"><ArrowLeft className="h-3.5 w-3.5" /> Retour analytics</Link>
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-3 py-2 text-left font-bold">Site</th>
                <th className="px-3 py-2 text-right font-bold">Actifs</th>
                <th className="px-3 py-2 text-right font-bold">Cible/sem</th>
                <th className="px-3 py-2 text-right font-bold">Planifié (sem.)</th>
                <th className="px-3 py-2 text-right font-bold">Réalisé (sem. -1)</th>
                <th className="px-3 py-2 text-right font-bold">Couverture</th>
                <th className="px-3 py-2 text-left font-bold">Top employé</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coverage.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-ink-3">Aucun département.</td></tr>
              ) : (
                coverage.map((r) => {
                  const actual = actualByDept.get(r.department_id ?? "__none__") ?? 0;
                  const top = topByDept.get(r.name) ?? null;
                  const linkHref = `/planning/calendar?week=${curStart}`;
                  return (
                    <tr key={r.department_id ?? "none"} className="hover:bg-surface-2 transition-colors">
                      <td className="px-3 py-3 font-semibold">
                        <Link href={linkHref} className="hover:text-gold-dark">{r.name}</Link>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{r.active_employees}</td>
                      <td className="px-3 py-3 text-right font-mono">{r.target_hours.toFixed(0)}h</td>
                      <td className="px-3 py-3 text-right font-mono">{r.planned_hours.toFixed(0)}h</td>
                      <td className="px-3 py-3 text-right font-mono">{actual.toFixed(0)}h</td>
                      <td className="px-3 py-3 text-right">
                        <span className={`inline-block font-mono font-extrabold px-2 py-0.5 rounded text-[11px] ${
                          r.band === "danger" ? "bg-danger-light text-danger" :
                          r.band === "warn" ? "bg-warn-light text-warn" :
                          r.band === "ok" ? "bg-success-light text-success" :
                          "bg-gold-light text-gold-dark"
                        }`}>
                          {r.coverage_pct.toFixed(0)}% · {bandLabel(r.band)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {top ? (
                          <span className="text-xs">
                            <span className="font-semibold">{top.full_name}</span>
                            <span className="text-ink-3"> · {top.score.toFixed(0)}</span>
                          </span>
                        ) : (
                          <span className="text-ink-3 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={linkHref} className="text-gold-dark hover:underline inline-flex items-center gap-1 text-xs font-bold">
                          Planning <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-ink-3 flex items-center gap-1.5">
        <Users className="h-3 w-3" />
        Cible = somme des heures hebdomadaires des employés actifs rattachés au site.
        Planifié = heures de shifts assignées sur la semaine. Bands : &lt; 60% danger, 60-80% limite, 80-110% OK, &gt; 110% sur-staffé.
      </p>
    </div>
  );
}
