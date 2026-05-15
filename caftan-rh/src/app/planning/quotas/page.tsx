import Link from "next/link";
import { TrendingUp, TrendingDown, AlertTriangle, Building2, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import {
  loadQuotasForPeriod,
  type PeriodKey,
  type SiteCoverageRow,
  type EmployeePeriodRow,
} from "@/lib/quotas-period";
import { PeriodSelector } from "./period-selector";

const VALID_PERIODS: PeriodKey[] = ["this_week", "next_week", "4w", "12w", "this_month"];

function periodLabel(p: PeriodKey): string {
  switch (p) {
    case "this_week": return "semaine en cours";
    case "next_week": return "semaine prochaine";
    case "4w": return "4 prochaines semaines";
    case "12w": return "12 prochaines semaines";
    case "this_month": return "mois en cours";
  }
}

function bandBadge(band: SiteCoverageRow["band"]): { cls: string; label: string } {
  switch (band) {
    case "danger": return { cls: "bg-danger-light text-danger border-danger/30", label: "Critique" };
    case "warn": return { cls: "bg-warn-light text-warn border-warn/30", label: "Tendu" };
    case "ok": return { cls: "bg-success-light text-success border-success/30", label: "OK" };
    case "over": return { cls: "bg-violet-100 text-violet-800 border-violet-300", label: "Surplus" };
  }
}

function empBandBadge(band: EmployeePeriodRow["band"]): { cls: string; label: string } {
  switch (band) {
    case "over": return { cls: "bg-danger-light text-danger", label: "Dépassement" };
    case "warn": return { cls: "bg-warn-light text-warn", label: "Proche cible" };
    case "ok": return { cls: "bg-success-light text-success", label: "OK" };
    case "under": return { cls: "bg-surface-2 text-ink-3", label: "Sous-utilisé" };
  }
}

export default async function QuotasPage(props: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await props.searchParams;
  const periodParam = (sp.period as PeriodKey) || "this_week";
  const period: PeriodKey = VALID_PERIODS.includes(periodParam)
    ? periodParam
    : "this_week";

  const data = await loadQuotasForPeriod(period);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quotas — décision direction & RH</h1>
          <p className="text-sm text-ink-2">
            Vue {periodLabel(period)} ({data.startISO} → {data.endISO}, {data.weeksInPeriod.toFixed(1)} sem)
          </p>
        </div>
        <PeriodSelector current={period} />
      </div>

      {/* KPI direction : 4 cards horizontales en tete. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Couverture besoins"
          value={`${data.kpi.coverage_pct.toFixed(0)}%`}
          sub={`${data.kpi.total_planned_hours.toFixed(0)}h / ${data.kpi.total_required_hours.toFixed(0)}h requis`}
          tone={data.kpi.coverage_pct >= 95 ? "ok" : data.kpi.coverage_pct >= 80 ? "warn" : "danger"}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Déficit a combler"
          value={
            data.kpi.total_deficit_hours > 0
              ? `${data.kpi.total_deficit_hours.toFixed(0)}h`
              : "0h"
          }
          sub={`${data.kpi.sites_in_danger} site${data.kpi.sites_in_danger > 1 ? "s" : ""} en zone critique`}
          tone={data.kpi.total_deficit_hours <= 0 ? "ok" : data.kpi.sites_in_danger > 0 ? "danger" : "warn"}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Employés en dépassement"
          value={`${data.kpi.employees_over}`}
          sub={`Heures sup : ${data.kpi.total_overtime_hours.toFixed(0)}h sur la periode`}
          tone={data.kpi.employees_over === 0 ? "ok" : "warn"}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Employés sous-utilisés"
          value={`${data.kpi.employees_under}`}
          sub={data.kpi.employees_under > 0 ? "À mobiliser pour combler déficit" : "Tous au-dessus de 60% de cible"}
          tone={data.kpi.employees_under === 0 ? "ok" : "warn"}
        />
      </div>

      {/* Recommandations contextuelles : aide a la prise de decision. */}
      {data.kpi.total_deficit_hours > 0 && data.kpi.employees_under > 0 ? (
        <div className="rounded-md border border-gold/40 bg-gold-light/30 p-3 text-sm">
          <div className="font-bold text-gold-dark mb-1 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Recommandation
          </div>
          <p className="text-ink-2">
            Tu as un déficit de <strong>{data.kpi.total_deficit_hours.toFixed(0)}h</strong> sur la periode
            ET <strong>{data.kpi.employees_under} employé{data.kpi.employees_under > 1 ? "s sous-utilisés" : " sous-utilisé"}</strong>.
            Affecter ces employés en priorité aux sites critiques permettrait de réduire le déficit sans recourir aux heures sup.
          </p>
        </div>
      ) : null}

      {/* Couverture par site. */}
      <Card>
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Couverture besoins par site (uniquement sites avec planning)
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Heures requises (sum des site_needs × occurrences jours) vs heures planifiées sur la periode.
            Seuls les sites qui ont au moins 1 shift sur la période sont comptabilisés (Karim 15/05).
            Trié par déficit décroissant.
          </p>
        </div>
        {data.sites.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Aucun site configuré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="text-left px-3 py-2">Site</th>
                  <th className="text-right px-3 py-2">Requis</th>
                  <th className="text-right px-3 py-2">Contractuel</th>
                  <th className="text-right px-3 py-2">H. sup</th>
                  <th className="text-right px-3 py-2">Couverture</th>
                  <th className="text-right px-3 py-2">Déficit</th>
                  <th className="text-center px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.sites.map((s) => {
                  const badge = bandBadge(s.band);
                  return (
                    <tr key={s.site_id} className="border-t border-line hover:bg-surface-2">
                      <td className="px-3 py-2">
                        <Link
                          href={`/planning/sites/${s.site_code}`}
                          className="inline-flex items-center gap-2 font-bold hover:text-gold-dark"
                        >
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-white font-bold text-[10px]"
                            style={{ backgroundColor: s.site_color ?? "#666" }}
                          >
                            {s.site_code}
                          </span>
                          {s.site_name}
                        </Link>
                      </td>
                      <td className="text-right px-3 py-2 font-mono">{s.required_hours.toFixed(0)}h</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{s.contractual_hours.toFixed(0)}h</td>
                      <td className="text-right px-3 py-2 font-mono text-orange-600">{s.overtime_hours.toFixed(0)}h</td>
                      <td className="text-right px-3 py-2 font-mono font-bold">
                        {s.coverage_pct.toFixed(0)}%
                      </td>
                      <td className={`text-right px-3 py-2 font-mono font-bold ${s.deficit_hours > 0 ? "text-danger" : "text-success"}`}>
                        {s.deficit_hours > 0 ? `−${s.deficit_hours.toFixed(0)}h` : `+${(-s.deficit_hours).toFixed(0)}h`}
                      </td>
                      <td className="text-center px-3 py-2">
                        <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quotas employes sur la periode. */}
      <Card>
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Charge par employé sur la periode
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Cible : weekly_hours × {data.weeksInPeriod.toFixed(1)} semaines. Trié par criticité (dépassement → sous-utilisation).
          </p>
        </div>
        {data.employees.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">Aucun employé actif.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="text-left px-3 py-2">Employé</th>
                  <th className="text-right px-3 py-2">Cible</th>
                  <th className="text-right px-3 py-2">Contractuel</th>
                  <th className="text-right px-3 py-2">H. sup</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">%</th>
                  <th className="text-center px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((r) => {
                  const badge = empBandBadge(r.band);
                  return (
                    <tr key={r.employee.id} className="border-t border-line hover:bg-surface-2">
                      <td className="px-3 py-2">
                        <Link
                          href={`/planning/employees/${r.employee.id}`}
                          className="font-bold hover:text-gold-dark"
                        >
                          {r.employee.full_name}
                        </Link>
                        <div className="text-[10px] text-ink-3">
                          {r.employee.weekly_hours ?? 38}h/sem · {r.employee.contract_type ?? "—"}
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{r.target_hours.toFixed(0)}h</td>
                      <td className="text-right px-3 py-2 font-mono">{r.contractual_hours.toFixed(1)}h</td>
                      <td className="text-right px-3 py-2 font-mono text-orange-600">{r.overtime_hours.toFixed(1)}h</td>
                      <td className="text-right px-3 py-2 font-mono font-bold">{r.planned_hours.toFixed(1)}h</td>
                      <td className={`text-right px-3 py-2 font-mono font-bold ${r.band === "over" ? "text-danger" : r.band === "under" ? "text-ink-3" : "text-success"}`}>
                        {(r.progress * 100).toFixed(0)}%
                      </td>
                      <td className="text-center px-3 py-2">
                        <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-danger/40 bg-danger-light/20"
      : tone === "warn"
        ? "border-warn/40 bg-warn-light/20"
        : "border-success/40 bg-success-light/20";
  const textCls =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-success";
  return (
    <Card className={`${toneCls}`}>
      <div className="p-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-ink-3">
          <span>{label}</span>
          <span className={textCls}>{icon}</span>
        </div>
        <div className={`text-2xl font-bold mt-1 ${textCls}`}>{value}</div>
        <div className="text-[11px] text-ink-2 mt-0.5">{sub}</div>
      </div>
    </Card>
  );
}
