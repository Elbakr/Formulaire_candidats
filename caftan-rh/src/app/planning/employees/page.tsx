import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { EmployeesActions, ExportEmployeesButton } from "./employees-actions";
import { EmployeesList } from "./employees-list";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const todayISO = new Date().toISOString().slice(0, 10);
  const [
    { data: emps },
    { data: depts },
    { data: assignsRaw },
    { data: currentlyInRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(`id, full_name, email, phone, job_title, weekly_hours, contract_type, status, start_date, profile_id,
               department:departments(id, name)`)
      .order("status", { ascending: true })
      .order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("site_assignments")
      .select(
        `employee_id, is_primary,
         site:sites(code, color)`,
      )
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`),
    // Présence temps réel : vue clock_currently_in (clock_in_at IS NOT NULL
    // AND clock_out_at IS NULL). On ne charge que les colonnes nécessaires
    // pour le voyant + tooltip.
    supabase
      .from("clock_currently_in")
      .select("employee_id, clock_in_at"),
  ]);

  type AssignRow = {
    employee_id: string;
    is_primary: boolean;
    site: { code: string; color: string | null } | null;
  };
  const assigns = (assignsRaw ?? []) as unknown as AssignRow[];
  const sitesByEmp = new Map<string, Array<{ code: string; color: string | null; is_primary: boolean }>>();
  for (const a of assigns) {
    if (!a.site) continue;
    const arr = sitesByEmp.get(a.employee_id) ?? [];
    arr.push({ code: a.site.code, color: a.site.color, is_primary: a.is_primary });
    sitesByEmp.set(a.employee_id, arr);
  }
  for (const arr of sitesByEmp.values()) {
    arr.sort((x, y) => Number(y.is_primary) - Number(x.is_primary));
  }

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
    profile_id: string | null;
    department: { id: string; name: string } | null;
  }>;

  // Map empId -> { in_at } pour le voyant présence côté client.
  const presenceRows = (currentlyInRaw ?? []) as Array<{
    employee_id: string;
    clock_in_at: string;
  }>;
  const presenceByEmp: Record<string, { in_at: string }> = {};
  for (const p of presenceRows) {
    if (p.employee_id && p.clock_in_at) {
      presenceByEmp[p.employee_id] = { in_at: p.clock_in_at };
    }
  }

  const active = employees.filter((e) => e.status === "active");
  const archived = employees.filter((e) => e.status !== "active");
  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Employés</h1>
          <p className="text-sm text-ink-2">{active.length} actif·ve·s · {archived.length} archivé·e·s</p>
        </div>
        <div className="flex gap-2">
          <ExportEmployeesButton employees={employees} />
          <EmployeesActions departments={depts ?? []} />
        </div>
      </div>

      <EmployeesList
        employees={employees}
        sitesByEmp={sitesByEmp}
        isAdmin={isAdmin}
        presenceByEmp={presenceByEmp}
      />
    </div>
  );
}
