// /admin/overtime-audit — vue de suivi "heures contractuelles vs heures sup".
//
// Server component. Source de vérité : table `shifts` (avec `is_overtime`)
// croisée avec `employees.weekly_hours`. Pour chaque employé/semaine on
// compare la somme contractuelle (`is_overtime = false`) au target hebdo et
// on affiche les OT (`is_overtime = true`) à part.
//
// Sécurité : admin / rh / manager (le layout admin filtre déjà sur "admin",
// mais on garde le check ici pour matcher la spec et faciliter une future
// extension RBAC).

import Link from "next/link";
import { Activity, AlertTriangle, ChevronRight, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import {
  addDays,
  startOfWeek,
  toISODate,
  shiftHours,
} from "@/lib/planning";
import { OvertimeAuditFilters, type PeriodKey } from "./filters";
import { ReclassifyButton } from "./reclassify-button";

export const dynamic = "force-dynamic";

type SearchParams = {
  period?: string;
  sites?: string;
  contract?: string;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  weekly_hours: number | null;
  contract_type: string | null;
  status: string;
};

type ShiftRow = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  is_overtime: boolean | null;
  site_id: string | null;
};

type SiteRow = { id: string; code: string; name: string };

type SiteAssign = {
  employee_id: string;
  site: { id: string; code: string } | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers

function periodBounds(period: PeriodKey): {
  weeks: string[]; // lundis ISO
  fromDate: string;
  toDate: string;
  label: string;
} {
  const today = new Date();
  const thisMonday = startOfWeek(today);
  let firstMonday: Date;
  let nbWeeks: number;
  let label: string;

  switch (period) {
    case "this_week":
      firstMonday = thisMonday;
      nbWeeks = 1;
      label = "Cette semaine";
      break;
    case "next_week":
      firstMonday = addDays(thisMonday, 7);
      nbWeeks = 1;
      label = "Semaine prochaine";
      break;
    case "last_4w":
      firstMonday = addDays(thisMonday, -7 * 3);
      nbWeeks = 4;
      label = "4 dernières semaines";
      break;
    case "next_8w":
    default:
      firstMonday = thisMonday;
      nbWeeks = 8;
      label = "8 prochaines semaines";
      break;
  }

  const weeks: string[] = [];
  for (let i = 0; i < nbWeeks; i++) {
    weeks.push(toISODate(addDays(firstMonday, i * 7)));
  }
  const fromDate = weeks[0];
  const toDate = toISODate(addDays(addDays(firstMonday, (nbWeeks - 1) * 7), 6));
  return { weeks, fromDate, toDate, label };
}

function contractGroup(t: string | null | undefined): "cdi" | "cdd" | "student" | "other" {
  if (!t) return "other";
  const c = t.toLowerCase();
  if (c.includes("étudiant") || c.includes("etudiant") || c === "student") return "student";
  if (c === "cdd" || c.includes("cdd")) return "cdd";
  if (c === "cdi" || c.includes("cdi")) return "cdi";
  return "other";
}

function fmtHours(n: number): string {
  return `${n.toFixed(1)}h`;
}

// ────────────────────────────────────────────────────────────────────────────
// Page

export default async function OvertimeAuditPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await props.searchParams;

  const period = (sp.period as PeriodKey) || "this_week";
  const contractFilter = sp.contract || "all";
  const selectedSiteCodes = (sp.sites ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { weeks, fromDate, toDate, label } = periodBounds(period);

  const supabase = await createClient();

  const [
    { data: empsRaw },
    { data: sitesRaw },
    { data: assignsRaw },
    { data: shiftsRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, weekly_hours, contract_type, status")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("sites")
      .select("id, code, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("site_assignments")
      .select(
        `employee_id, is_primary,
         site:sites(id, code)`,
      )
      .lte("start_date", toDate)
      .or(`end_date.is.null,end_date.gte.${fromDate}`),
    supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, break_minutes, is_overtime, site_id",
      )
      .gte("date", fromDate)
      .lte("date", toDate),
  ]);

  const allEmployees = (empsRaw ?? []) as EmployeeRow[];
  const sites = (sitesRaw ?? []) as SiteRow[];
  const assigns = (assignsRaw ?? []) as unknown as SiteAssign[];
  const shifts = (shiftsRaw ?? []) as ShiftRow[];

  // Map empId → set de codes sites (pour le filtre).
  const sitesByEmp = new Map<string, Set<string>>();
  for (const a of assigns) {
    if (!a.site) continue;
    const set = sitesByEmp.get(a.employee_id) ?? new Set();
    set.add(a.site.code);
    sitesByEmp.set(a.employee_id, set);
  }

  // Filtre employés selon contrat + sites sélectionnés.
  const employees = allEmployees.filter((e) => {
    if (contractFilter !== "all" && contractGroup(e.contract_type) !== contractFilter) {
      return false;
    }
    if (selectedSiteCodes.length > 0) {
      const empSites = sitesByEmp.get(e.id);
      if (!empSites) return false;
      const hit = selectedSiteCodes.some((c) => empSites.has(c));
      if (!hit) return false;
    }
    return true;
  });

  // Pré-index shifts par empId puis par lundi.
  type WeekCell = { contractual: number; overtime: number; hasOtTag: boolean };
  const cellsByEmp = new Map<string, Map<string, WeekCell>>();
  const weekSet = new Set(weeks);

  for (const s of shifts) {
    // Trouve le lundi de cette date.
    const monday = toISODate(startOfWeek(new Date(s.date + "T00:00:00")));
    if (!weekSet.has(monday)) continue;
    const h = shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
    let weekMap = cellsByEmp.get(s.employee_id);
    if (!weekMap) {
      weekMap = new Map();
      cellsByEmp.set(s.employee_id, weekMap);
    }
    let cell = weekMap.get(monday);
    if (!cell) {
      cell = { contractual: 0, overtime: 0, hasOtTag: false };
      weekMap.set(monday, cell);
    }
    if (s.is_overtime) {
      cell.overtime += h;
      cell.hasOtTag = true;
    } else {
      cell.contractual += h;
    }
  }

  // KPI globaux + détection des employés "à reclassifier".
  let totalContractual = 0;
  let totalOvertime = 0;
  let overContractCount = 0;
  let employeesWithData = 0;
  const employeesToReclassify = new Set<string>();

  type EmpAggregate = {
    emp: EmployeeRow;
    totalContractual: number;
    totalOvertime: number;
    weeklyOverages: number; // nb de semaines en dépassement
    cumulativeTarget: number;
    needsReclassif: boolean;
  };
  const empAgg = new Map<string, EmpAggregate>();

  for (const e of employees) {
    const target = e.weekly_hours ?? 38;
    const wmap = cellsByEmp.get(e.id);
    let tContract = 0;
    let tOt = 0;
    let weekOver = 0;
    let needsReclassif = false;

    for (const wk of weeks) {
      const cell = wmap?.get(wk);
      if (!cell) continue;
      tContract += cell.contractual;
      tOt += cell.overtime;
      if (cell.contractual > target + 0.01) {
        weekOver += 1;
        if (!cell.hasOtTag) needsReclassif = true;
      }
    }

    totalContractual += tContract;
    totalOvertime += tOt;
    if (tContract + tOt > 0) employeesWithData += 1;
    if (weekOver > 0) overContractCount += 1;
    if (needsReclassif) employeesToReclassify.add(e.id);

    empAgg.set(e.id, {
      emp: e,
      totalContractual: tContract,
      totalOvertime: tOt,
      weeklyOverages: weekOver,
      cumulativeTarget: target * weeks.length,
      needsReclassif,
    });
  }

  const ratioOt =
    totalContractual + totalOvertime > 0
      ? (totalOvertime / (totalContractual + totalOvertime)) * 100
      : 0;

  // ── CSV link ─────────────────────────────────────────────────────────────
  const csvParams = new URLSearchParams();
  csvParams.set("period", period);
  if (contractFilter !== "all") csvParams.set("contract", contractFilter);
  if (selectedSiteCodes.length > 0) csvParams.set("sites", selectedSiteCodes.join(","));
  const csvHref = `/admin/overtime-audit/export?${csvParams.toString()}`;

  // ── KPI cards ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-warn" />
            Audit heures sup
          </h1>
          <p className="text-sm text-ink-2">
            Contractuel vs OT par employé/semaine — {label.toLowerCase()}.{" "}
            <Link
              href="/admin/help/planning"
              className="text-gold-dark hover:underline inline-flex items-center gap-1"
            >
              <FileText className="h-3.5 w-3.5" /> règles du solver
            </Link>
          </p>
        </div>
        <ReclassifyButton
          fromDate={fromDate}
          toDate={toDate}
          employeeIds={null}
          size="default"
        />
      </div>

      <Card className="p-3">
        <OvertimeAuditFilters
          period={period}
          contract={contractFilter}
          selectedSites={selectedSiteCodes}
          allSites={sites}
          csvHref={csvHref}
        />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiCard label="Employés couverts" value={String(employeesWithData)} />
        <KpiCard
          label="Heures contractuelles"
          value={fmtHours(totalContractual)}
          tone="success"
        />
        <KpiCard
          label="Heures supplémentaires"
          value={fmtHours(totalOvertime)}
          tone="warn"
        />
        <KpiCard label="Ratio OT %" value={`${ratioOt.toFixed(1)}%`} />
        <KpiCard
          label="En dépassement contractuel"
          value={String(overContractCount)}
          tone={overContractCount > 0 ? "danger" : "success"}
        />
      </div>

      {employeesToReclassify.size > 0 ? (
        <div className="rounded-md border border-warn-light bg-warn-light/40 text-ink p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
          <div>
            <strong>{employeesToReclassify.size} employé(s)</strong> en
            dépassement contractuel sans OT taggé sur la période. La
            reclassification douce taguera les shifts les plus récents en{" "}
            <code className="bg-surface-2 px-1 rounded">is_overtime = true</code>{" "}
            (×1.5) pour respecter la séparation contractuel/OT.
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto scroll-smooth-touch">
          <table className="min-w-full text-xs">
            <thead className="bg-surface-2 text-ink-3 uppercase tracking-wider text-[10px] sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-surface-2 z-[1] min-w-[180px]">
                  Employé
                </th>
                <th className="text-left px-2 py-2">Contrat</th>
                <th className="text-right px-2 py-2">Cible/sem</th>
                {weeks.map((wk) => (
                  <th
                    key={wk}
                    className="text-center px-2 py-2 min-w-[80px]"
                    title={wk}
                  >
                    {wk.slice(5)}
                  </th>
                ))}
                <th className="text-left px-3 py-2 min-w-[260px]">Total période</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const agg = empAgg.get(e.id);
                if (!agg) return null;
                const wmap = cellsByEmp.get(e.id);
                const target = e.weekly_hours ?? 38;
                const diff = agg.totalContractual - agg.cumulativeTarget;
                const grp = contractGroup(e.contract_type);
                return (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 sticky left-0 bg-surface z-[1]">
                      <EmployeeQuickLink
                        employeeId={e.id}
                        fullName={e.full_name}
                        suffix={
                          agg.needsReclassif ? (
                            <Link
                              href="#reclassif"
                              className="inline-flex items-center gap-1 rounded-full bg-warn-light text-warn text-[10px] font-bold px-2 py-[2px] hover:bg-warn hover:text-white transition-colors"
                              title="Dépassement contractuel détecté sans OT taggé — reclassification recommandée."
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Reclassif. à faire
                            </Link>
                          ) : null
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-ink-2">
                      <span className="uppercase text-[10px] font-bold">
                        {grp === "other" ? (e.contract_type ?? "—") : grp}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {target}h
                    </td>
                    {weeks.map((wk) => {
                      const cell = wmap?.get(wk);
                      const contract = cell?.contractual ?? 0;
                      const ot = cell?.overtime ?? 0;
                      const over = contract > target + 0.01;
                      const empty = contract === 0 && ot === 0;
                      return (
                        <td
                          key={wk}
                          className={`px-2 py-2 text-center tabular-nums ${
                            empty ? "text-ink-3" : ""
                          }`}
                        >
                          {empty ? (
                            <span className="text-[10px]">—</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5 leading-tight">
                              <span
                                className={`text-xs font-bold ${
                                  over ? "text-danger" : "text-success"
                                }`}
                                title={`${contract.toFixed(1)}h contractuelles${over ? ` (>${target}h)` : ""}`}
                              >
                                {contract.toFixed(1)}
                              </span>
                              {ot > 0 ? (
                                <span
                                  className="text-[10px] font-bold text-warn"
                                  title={`${ot.toFixed(1)}h supplémentaires`}
                                >
                                  +{ot.toFixed(1)} OT
                                </span>
                              ) : null}
                              {over && !cell?.hasOtTag ? (
                                <AlertTriangle
                                  className="h-3 w-3 text-warn"
                                  aria-label="Dépassement sans OT taggé"
                                />
                              ) : null}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-[11px]">
                      <div className="flex flex-col gap-0.5">
                        <span>
                          <span className="text-success font-bold">
                            Contract&nbsp;: {agg.totalContractual.toFixed(1)}h
                          </span>
                          {agg.totalOvertime > 0 ? (
                            <>
                              {" | "}
                              <span className="text-warn font-bold">
                                OT&nbsp;: {agg.totalOvertime.toFixed(1)}h
                              </span>
                            </>
                          ) : null}
                          {" | "}
                          <span className="text-ink-3">
                            Cible&nbsp;: {agg.cumulativeTarget.toFixed(0)}h
                          </span>
                        </span>
                        {diff > 0.01 ? (
                          <span className="text-danger font-bold">
                            +{diff.toFixed(1)}h dépass.
                          </span>
                        ) : (
                          <span className="text-ink-3">
                            {diff <= 0 ? "OK" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + weeks.length}
                    className="px-3 py-6 text-center text-ink-3 text-sm"
                  >
                    Aucun employé ne correspond aux filtres.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div id="reclassif" className="scroll-mt-20">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="max-w-xl">
              <div className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warn" />
                Stratégie A — reclassification douce
              </div>
              <p className="text-xs text-ink-2 mt-1">
                Pour chaque employé/semaine en dépassement contractuel sans OT
                taggé, on tague les shifts les plus récents en{" "}
                <code className="bg-surface-2 px-1 rounded">is_overtime = true</code>{" "}
                (multiplicateur ×1.5, note auto). Tu peux d&apos;abord faire
                tourner en preview, puis confirmer en tapant{" "}
                <strong>RECLASSIFIER</strong>. L&apos;action est idempotente :
                relancée, elle ne re-tague pas ce qui l&apos;a déjà été.{" "}
                <Link
                  href="/admin/help/planning"
                  className="text-gold-dark hover:underline inline-flex items-center gap-1"
                >
                  Voir les règles <ChevronRight className="h-3 w-3" />
                </Link>
              </p>
            </div>
            <ReclassifyButton
              fromDate={fromDate}
              toDate={toDate}
              employeeIds={
                employeesToReclassify.size > 0
                  ? Array.from(employeesToReclassify)
                  : null
              }
              size="sm"
              label={
                employeesToReclassify.size > 0
                  ? `Reclassifier ${employeesToReclassify.size} employé(s)`
                  : "Lancer la reclassification douce"
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warn" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${color}`}>
        {value}
      </div>
    </Card>
  );
}
