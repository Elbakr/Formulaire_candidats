import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, department_id, created_at, department:departments(id, name)")
    .order("created_at", { ascending: false });

  const { data: depts } = await supabase.from("departments").select("id, name").order("name");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-ink-2">Gère les rôles et l'affectation aux services.</p>
      </div>
      <Card>
        <UsersTable users={(data ?? []) as never} departments={depts ?? []} />
      </Card>
    </div>
  );
}
