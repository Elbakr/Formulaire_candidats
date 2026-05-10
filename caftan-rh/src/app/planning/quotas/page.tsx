import { requireRole } from "@/lib/auth";
import { loadQuotasForAllActive } from "@/lib/quotas";
import { QuotasTable } from "./quotas-table";

export default async function QuotasPage() {
  await requireRole(["admin", "rh", "manager"]);
  const rows = await loadQuotasForAllActive();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Quotas employés</h1>
        <p className="text-sm text-ink-2">
          Suivi des heures planifiées (semaine, mois, année) vs cibles contractuelles.
          Les barres rouges indiquent un dépassement.
        </p>
      </div>
      <QuotasTable rows={rows} />
    </div>
  );
}
