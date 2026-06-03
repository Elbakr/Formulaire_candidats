// Karim 2026-06-03 : dashboard stats salaires - evolution mensuelle, par
// site, top 10, export comptable.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TrendingUp, Wallet, Users, Building2, Download, AlertCircle } from "lucide-react";
import Link from "next/link";
import { ExportButtons } from "./export-buttons";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fév", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

interface Payslip {
  id: string;
  employee_id: string | null;
  period_year: number;
  period_month: number;
  net_amount: number;
  gross_amount: number | null;
  amount_to_pay: number;
  payment_status: string;
  employer_org_key: string;
  created_at: string;
  employee?: { full_name: string; job_title: string | null } | null;
}

export default async function SalaryStatsPage({ searchParams }: { searchParams: Promise<{ year?: string; employer?: string }> }) {
  await requireRole(["admin", "rh"]);
  const params = await searchParams;
  const filterYear = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const filterEmployer = params.employer ?? "all";

  const admin = createAdminClient();
  let q = admin
    .from("payslips")
    .select("id, employee_id, period_year, period_month, net_amount, gross_amount, amount_to_pay, payment_status, employer_org_key, created_at, employee:employees(full_name, job_title)")
    .eq("period_year", filterYear)
    .limit(2000);
  if (filterEmployer !== "all") q = q.eq("employer_org_key", filterEmployer);
  const { data: rawPayslips } = await q;
  const payslips = (rawPayslips ?? []) as Payslip[];

  // Agrégats
  const totalNet = payslips.reduce((s, p) => s + Number(p.net_amount), 0);
  const totalGross = payslips.reduce((s, p) => s + Number(p.gross_amount ?? 0), 0);
  const totalToPay = payslips.reduce((s, p) => s + Number(p.amount_to_pay), 0);
  const paid = payslips.filter((p) => p.payment_status === "paid");
  const unpaid = payslips.filter((p) => p.payment_status !== "paid");
  const paidAmount = paid.reduce((s, p) => s + Number(p.amount_to_pay), 0);
  const unpaidAmount = unpaid.reduce((s, p) => s + Number(p.amount_to_pay), 0);

  // Évolution mensuelle (par mois × employeur)
  const byMonth: Map<number, { amd: number; caftan: number; total: number; count: number }> = new Map();
  for (let m = 1; m <= 12; m++) byMonth.set(m, { amd: 0, caftan: 0, total: 0, count: 0 });
  for (const p of payslips) {
    const cur = byMonth.get(p.period_month)!;
    const amt = Number(p.net_amount);
    if (p.employer_org_key === "amd_megastore") cur.amd += amt;
    else if (p.employer_org_key === "caftan_factory") cur.caftan += amt;
    cur.total += amt;
    cur.count++;
  }
  const maxMonthly = Math.max(...Array.from(byMonth.values()).map((v) => v.total), 1);

  // Top 10 salaires
  const byEmployee = new Map<string, { id: string; name: string; job: string; total: number; count: number }>();
  for (const p of payslips) {
    if (!p.employee_id) continue;
    const key = p.employee_id;
    const cur = byEmployee.get(key) ?? { id: key, name: p.employee?.full_name ?? "?", job: p.employee?.job_title ?? "", total: 0, count: 0 };
    cur.total += Number(p.net_amount);
    cur.count++;
    byEmployee.set(key, cur);
  }
  const top10 = Array.from(byEmployee.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  const uniqueEmployees = byEmployee.size;

  // Anomalies (montants > 2× moyenne ou < 50% moyenne)
  const avgNet = payslips.length > 0 ? totalNet / payslips.length : 0;
  const anomalies = payslips
    .filter((p) => Number(p.net_amount) > 2 * avgNet || (Number(p.net_amount) > 0 && Number(p.net_amount) < 0.3 * avgNet))
    .slice(0, 20);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Statistiques salaires
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Évolution + analyse + export comptable
          </p>
        </div>
        <ExportButtons year={filterYear} employer={filterEmployer} />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Année :</span>
        {[filterYear - 1, filterYear, filterYear + 1].map((y) => (
          <Link
            key={y}
            href={`/rh/stats?year=${y}&employer=${filterEmployer}`}
            className={`px-2 py-1 rounded ${y === filterYear ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {y}
          </Link>
        ))}
        <span className="mx-2 text-ink-3">·</span>
        <span className="font-semibold">Employeur :</span>
        {[
          { k: "all", l: "Tous" },
          { k: "amd_megastore", l: "AMD Megastore" },
          { k: "caftan_factory", l: "Caftan Factory" },
        ].map((e) => (
          <Link
            key={e.k}
            href={`/rh/stats?year=${filterYear}&employer=${e.k}`}
            className={`px-2 py-1 rounded ${filterEmployer === e.k ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {e.l}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-ink-3"><Wallet className="w-3.5 h-3.5" /> Net total {filterYear}</div>
          <div className="text-2xl font-bold mt-1">{totalNet.toFixed(0)} €</div>
          <div className="text-[10px] text-ink-3">Brut : {totalGross.toFixed(0)} €</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-ink-3"><Users className="w-3.5 h-3.5" /> Fiches</div>
          <div className="text-2xl font-bold mt-1">{payslips.length}</div>
          <div className="text-[10px] text-ink-3">{uniqueEmployees} employés</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-ink-3">✓ Payé</div>
          <div className="text-2xl font-bold mt-1 text-green-700">{paidAmount.toFixed(0)} €</div>
          <div className="text-[10px] text-ink-3">{paid.length} fiches</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-ink-3">⏳ Reste à payer</div>
          <div className="text-2xl font-bold mt-1 text-red-700">{unpaidAmount.toFixed(0)} €</div>
          <div className="text-[10px] text-ink-3">{unpaid.length} fiches</div>
        </Card>
      </div>

      {/* Évolution mensuelle - barres */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-sm">Évolution mensuelle {filterYear}</h2>
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          {Array.from(byMonth.entries()).map(([m, v]) => {
            const heightPct = (v.total / maxMonthly) * 100;
            return (
              <div key={m} className="flex flex-col items-center gap-1">
                <div className="h-32 w-full bg-muted rounded relative overflow-hidden flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 transition-all"
                    style={{ height: `${Math.max(heightPct, v.total > 0 ? 2 : 0)}%` }}
                    title={`${v.total.toFixed(0)} € · ${v.count} fiches`}
                  />
                </div>
                <div className="text-[9px] text-ink-3">{MONTHS[m - 1]}</div>
                <div className="text-[9px] font-semibold">{v.total > 0 ? `${(v.total / 1000).toFixed(1)}k` : "—"}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top 10 + Anomalies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gold" />
            <h2 className="font-semibold text-sm">Top 10 salaires {filterYear}</h2>
          </div>
          {top10.length === 0 && <div className="text-xs text-ink-3 italic">Aucune donnée.</div>}
          <div className="space-y-1.5">
            {top10.map((e, i) => (
              <Link key={e.id} href={`/planning/employees/${e.id}`} className="flex items-center gap-2 hover:bg-muted/30 rounded p-1.5 text-xs">
                <span className="text-ink-3 w-5">#{i + 1}</span>
                <span className="flex-1 truncate font-medium">{e.name}</span>
                <span className="text-[10px] text-ink-3">{e.count} fiches</span>
                <span className="font-bold tabular-nums">{e.total.toFixed(0)} €</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-sm">Anomalies (vs moyenne {avgNet.toFixed(0)} €)</h2>
          </div>
          {anomalies.length === 0 && <div className="text-xs text-ink-3 italic">Aucune anomalie détectée.</div>}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {anomalies.map((p) => {
              const isHigh = Number(p.net_amount) > 2 * avgNet;
              return (
                <div key={p.id} className="flex items-center gap-2 p-1.5 text-xs rounded bg-amber-50/30">
                  <span className="flex-1 truncate">{p.employee?.full_name ?? "(orphan)"}</span>
                  <span className="text-[10px] text-ink-3">{MONTHS[p.period_month - 1]}</span>
                  <span className={`font-bold tabular-nums ${isHigh ? "text-red-700" : "text-blue-700"}`}>
                    {isHigh ? "↑" : "↓"} {Number(p.net_amount).toFixed(0)} €
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
