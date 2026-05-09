import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { NameAvatar } from "@/components/ui/avatar";
import { EmployeesActions } from "./employees-actions";
import { formatDate } from "@/lib/utils";

export default async function EmployeesPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const [{ data: emps }, { data: depts }] = await Promise.all([
    supabase
      .from("employees")
      .select(`id, full_name, email, phone, job_title, weekly_hours, contract_type, status, start_date,
               department:departments(id, name)`)
      .order("status", { ascending: true })
      .order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  const employees = (emps ?? []) as unknown as Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    job_title: string | null;
    weekly_hours: number | null;
    contract_type: string | null;
    status: "active" | "on_leave" | "archived";
    start_date: string;
    department: { id: string; name: string } | null;
  }>;

  const active = employees.filter((e) => e.status === "active");
  const archived = employees.filter((e) => e.status !== "active");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Employés</h1>
          <p className="text-sm text-ink-2">{active.length} actif·ve·s · {archived.length} archivé·e·s</p>
        </div>
        <EmployeesActions departments={depts ?? []} />
      </div>

      <Card>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Pas encore d'employé. Quand un candidat passe au statut "Embauché", il est automatiquement créé ici.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {employees.map((e) => (
              <div key={e.id} className="p-3 flex items-center gap-3 flex-wrap">
                <NameAvatar name={e.full_name} className={e.status !== "active" ? "opacity-50" : ""} />
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-sm">{e.full_name}</div>
                  <div className="text-xs text-ink-3">
                    {e.job_title ?? "—"} · {e.department?.name ?? "Sans service"} · {e.contract_type ?? "—"} · {e.weekly_hours ?? 38}h/sem
                  </div>
                </div>
                <span className="text-[11px] text-ink-3 hidden md:inline">depuis {formatDate(e.start_date)}</span>
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                    e.status === "active"
                      ? "bg-success-light text-success"
                      : e.status === "on_leave"
                        ? "bg-warn-light text-warn"
                        : "bg-surface-2 text-ink-3"
                  }`}
                >
                  {e.status === "active" ? "Actif" : e.status === "on_leave" ? "En congé" : "Archivé"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
