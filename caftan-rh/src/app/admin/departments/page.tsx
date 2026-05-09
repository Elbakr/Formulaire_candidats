import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { DepartmentsList } from "./departments-list";

export default async function AdminDepartmentsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name, created_at").order("name");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Services</h1>
        <p className="text-sm text-ink-2">Organise les services de l'entreprise.</p>
      </div>
      <Card>
        <DepartmentsList initialDepartments={data ?? []} />
      </Card>
    </div>
  );
}
