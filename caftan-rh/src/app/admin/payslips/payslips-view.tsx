"use client";

// Karim 2026-05-30 : vue client-side avec filtres INSTANTANÉS (statut + employeur).
// Reçoit toutes les rows du server, filtre côté client → zéro refresh requis.

import { useMemo, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { PayslipsTable, type PayslipRow } from "./payslips-table";

type StatusFilter = "all" | "unpaid" | "paid";
type EmployerFilter = "all" | "amd_megastore" | "caftan_factory";
type CityFilter = "all" | "Bruxelles" | "Anvers";

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "Toutes",
  unpaid: "À payer",
  paid: "Payées",
};
const EMPLOYER_LABEL: Record<EmployerFilter, string> = {
  all: "Tous",
  amd_megastore: "AMD Megastore",
  caftan_factory: "Caftan Factory",
};

export function PayslipsView({
  allRows,
  initialStatusFilter = "all",
}: {
  allRows: PayslipRow[];
  initialStatusFilter?: StatusFilter;
}) {
  const [status, setStatus] = useState<StatusFilter>(initialStatusFilter);
  const [employer, setEmployer] = useState<EmployerFilter>("all");
  const [city, setCity] = useState<CityFilter>("all");

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (status === "unpaid" && r.payment_status !== "pending" && r.payment_status !== "scheduled") return false;
      if (status === "paid" && r.payment_status !== "paid") return false;
      if (employer !== "all" && r.employer_org_key !== employer) return false;
      if (city !== "all" && r.employee_city !== city) return false;
      return true;
    });
  }, [allRows, status, employer, city]);

  const counts = useMemo(() => {
    const byStatus = (s: StatusFilter) =>
      allRows.filter((r) => {
        if (s === "unpaid") return r.payment_status === "pending" || r.payment_status === "scheduled";
        if (s === "paid") return r.payment_status === "paid";
        return true;
      }).length;
    const byEmployer = (e: EmployerFilter) =>
      allRows.filter((r) => e === "all" || r.employer_org_key === e).length;
    const byCity = (cf: CityFilter) =>
      allRows.filter((r) => cf === "all" || r.employee_city === cf).length;
    return {
      status: { all: byStatus("all"), unpaid: byStatus("unpaid"), paid: byStatus("paid") },
      employer: { all: byEmployer("all"), amd_megastore: byEmployer("amd_megastore"), caftan_factory: byEmployer("caftan_factory") },
      city: { all: byCity("all"), Bruxelles: byCity("Bruxelles"), Anvers: byCity("Anvers") },
    };
  }, [allRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-3">Statut :</span>
          {(["all", "unpaid", "paid"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                status === f
                  ? "bg-foreground text-background border-foreground"
                  : "bg-surface text-ink-2 border-line hover:bg-muted"
              }`}
            >
              {STATUS_LABEL[f]} <span className="opacity-60">({counts.status[f]})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-3 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Employeur :
          </span>
          {(["all", "amd_megastore", "caftan_factory"] as EmployerFilter[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmployer(e)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                employer === e
                  ? "bg-foreground text-background border-foreground"
                  : "bg-surface text-ink-2 border-line hover:bg-muted"
              }`}
            >
              {EMPLOYER_LABEL[e]} <span className="opacity-60">({counts.employer[e]})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-3 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> Ville :
          </span>
          {(["all", "Bruxelles", "Anvers"] as CityFilter[]).map((cf) => (
            <button
              key={cf}
              type="button"
              onClick={() => setCity(cf)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                city === cf
                  ? "bg-foreground text-background border-foreground"
                  : "bg-surface text-ink-2 border-line hover:bg-muted"
              }`}
            >
              {cf === "all" ? "Toutes" : cf} <span className="opacity-60">({counts.city[cf]})</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-ink-3">
          {filtered.length} / {allRows.length} fiches affichées
        </span>
      </div>

      <PayslipsTable rows={filtered} />
    </div>
  );
}
