import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PayrollExporter } from "./exporter";
import { formatDateTime } from "@/lib/utils";

export default async function PayrollPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: depts }, { data: history }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("pay_periods_exported")
      .select(`year, month, employee_count, total_hours, exported_at,
               department:departments(name), exported_by_profile:profiles(full_name)`)
      .order("exported_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paie — Export CSV</h1>
        <p className="text-sm text-ink-2">
          Exporte les heures travaillées pour ton secrétariat social. Format pivot universel
          (à remapper si nécessaire selon SD Worx, Securex, Partena, Acerta…).
        </p>
      </div>

      <Card>
        <PayrollExporter departments={depts ?? []} />
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Historique des exports</h2>
        </div>
        {(!history || history.length === 0) ? (
          <div className="p-8 text-center text-sm text-ink-3">Aucun export pour l'instant.</div>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h, i) => {
              const dept = (h.department as { name?: string } | null)?.name;
              const by = (h.exported_by_profile as { full_name?: string } | null)?.full_name;
              return (
                <li key={i} className="p-3 flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-bold">
                    {String(h.month).padStart(2, "0")}/{h.year}
                  </span>
                  <span className="text-ink-3 text-xs">{dept ?? "Tous services"}</span>
                  <span className="ml-auto text-xs text-ink-2">
                    {h.employee_count} employés · {Number(h.total_hours).toFixed(1)}h totales
                  </span>
                  <span className="text-[11px] text-ink-3">par {by ?? "—"} · {formatDateTime(h.exported_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
