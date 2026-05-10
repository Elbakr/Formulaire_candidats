"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { downloadXlsx } from "@/lib/xlsx-export";
import type { EmployeeQuotaRow } from "@/lib/quotas-types";

type SortKey = "overage" | "name" | "contract";
type ContractFilter = "all" | "CDI" | "CDD" | "Étudiant";

function progressTone(progress: number): {
  bar: string;
  text: string;
} {
  if (progress > 1.0001) return { bar: "bg-danger", text: "text-danger" };
  if (progress >= 0.9) return { bar: "bg-warn", text: "text-warn" };
  return { bar: "bg-success", text: "text-success" };
}

function ProgressBar({
  value,
  target,
  className = "",
}: {
  value: number;
  target: number | null;
  className?: string;
}) {
  if (target == null || target <= 0) {
    return <div className={`text-[10px] text-ink-3 italic ${className}`}>—</div>;
  }
  const pct = (value / target) * 100;
  const tone = progressTone(value / target);
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-1 text-[11px]">
        <span className={`font-mono font-bold ${tone.text}`}>{value.toFixed(1)}h</span>
        <span className="text-ink-3 font-mono">/ {target.toFixed(0)}h</span>
      </div>
      <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone.bar}`}
          style={{ width: `${Math.min(120, pct)}%` }}
        />
      </div>
    </div>
  );
}

function classifyContract(c: string | null | undefined): ContractFilter {
  if (!c) return "all";
  const s = c.toLowerCase();
  if (s.includes("étudiant") || s.includes("etudiant") || s === "student") return "Étudiant";
  if (s.includes("cdd")) return "CDD";
  if (s.includes("cdi")) return "CDI";
  return "all";
}

export function QuotasTable({ rows }: { rows: EmployeeQuotaRow[] }) {
  const [sort, setSort] = useState<SortKey>("overage");
  const [contractFilter, setContractFilter] = useState<ContractFilter>("all");

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (contractFilter === "all") return true;
      return classifyContract(r.employee.contract_type) === contractFilter;
    });
    const sorted = [...filtered];
    if (sort === "overage") {
      sorted.sort((a, b) => {
        const aOver = a.quota.weekHours - a.quota.weekTarget;
        const bOver = b.quota.weekHours - b.quota.weekTarget;
        return bOver - aOver;
      });
    } else if (sort === "name") {
      sorted.sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
    } else if (sort === "contract") {
      sorted.sort((a, b) => {
        const aC = a.employee.contract_type ?? "";
        const bC = b.employee.contract_type ?? "";
        return aC.localeCompare(bC);
      });
    }
    return sorted;
  }, [rows, sort, contractFilter]);

  const overages = rows.filter(
    (r) => r.quota.weekHours > r.quota.weekTarget,
  ).length;

  function exportXlsx() {
    downloadXlsx("quotas-employes", [
      {
        name: "Quotas",
        rows: sorted,
        columns: [
          { key: (r) => r.employee.full_name, header: "Nom", width: 28 },
          { key: (r) => r.employee.contract_type ?? "", header: "Contrat", width: 14 },
          { key: (r) => r.quota.weekHours.toFixed(2), header: "Sem (h)", width: 10 },
          { key: (r) => r.quota.weekTarget, header: "Sem cible", width: 12 },
          { key: (r) => r.quota.monthHours.toFixed(2), header: "Mois (h)", width: 12 },
          { key: (r) => r.quota.monthTarget.toFixed(2), header: "Mois cible", width: 12 },
          { key: (r) => r.quota.yearHours.toFixed(2), header: "Année (h)", width: 12 },
          {
            key: (r) => (r.quota.yearTarget != null ? r.quota.yearTarget : ""),
            header: "Année cible",
            width: 12,
          },
          { key: (r) => r.quota.nextWeekHours.toFixed(2), header: "Sem N+1", width: 10 },
        ],
      },
    ]);
  }

  return (
    <Card>
      <div className="p-3 border-b border-line flex items-center gap-2 flex-wrap">
        <div className="text-xs text-ink-3">
          {sorted.length} employé{sorted.length > 1 ? "s" : ""}
          {overages > 0 ? (
            <span className="text-danger font-bold ml-2">
              · {overages} en dépassement S
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
            Contrat
            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value as ContractFilter)}
              className="rounded-md border border-line bg-canvas px-2 py-1 text-xs"
            >
              <option value="all">Tous</option>
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="Étudiant">Étudiant</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
            Tri
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-line bg-canvas px-2 py-1 text-xs"
            >
              <option value="overage">Dépassement</option>
              <option value="name">Nom</option>
              <option value="contract">Contrat</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={exportXlsx}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className="px-3 py-2 sticky left-0 bg-surface-2 z-[1] min-w-[180px]">
                <span className="inline-flex items-center gap-1">
                  Nom <ArrowUpDown className="h-3 w-3 text-ink-3" />
                </span>
              </th>
              <th className="px-3 py-2 min-w-[100px]">Contrat</th>
              <th className="px-3 py-2 min-w-[140px]">Semaine</th>
              <th className="px-3 py-2 min-w-[140px]">Mois</th>
              <th className="px-3 py-2 min-w-[140px]">Année (étud.)</th>
              <th className="px-3 py-2 min-w-[100px]">S+1</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-3 italic">
                  Aucun employé.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const over = r.quota.weekHours > r.quota.weekTarget;
                return (
                  <tr key={r.employee.id} className="border-t border-line hover:bg-surface-2/50">
                    <td className="px-3 py-2 sticky left-0 bg-surface z-[1]">
                      <EmployeeQuickLink
                        employeeId={r.employee.id}
                        fullName={r.employee.full_name}
                        withAvatar
                        suffix={
                          over ? (
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.5 rounded bg-danger-light text-danger">
                              !
                            </span>
                          ) : null
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-ink-2">{r.employee.contract_type ?? "—"}</td>
                    <td className="px-3 py-2">
                      <ProgressBar value={r.quota.weekHours} target={r.quota.weekTarget} />
                    </td>
                    <td className="px-3 py-2">
                      <ProgressBar value={r.quota.monthHours} target={r.quota.monthTarget} />
                    </td>
                    <td className="px-3 py-2">
                      <ProgressBar value={r.quota.yearHours} target={r.quota.yearTarget} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-bold">{r.quota.nextWeekHours.toFixed(1)}h</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
