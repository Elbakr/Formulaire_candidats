import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeAdminForm } from "./form";

export default async function EmployeeDetailPage(props: PageProps<"/planning/employees/[id]">) {
  const { id } = await props.params;
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const [{ data: emp }, { data: depts }, { data: managers }] = await Promise.all([
    supabase.from("employees").select("*, department:departments(id, name)").eq("id", id).single(),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "rh", "manager"]).order("full_name"),
  ]);
  if (!emp) notFound();

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/planning/employees"><ArrowLeft className="h-3.5 w-3.5" /> Retour liste</Link>
      </Button>
      <Card>
        <div className="p-4 border-b border-line">
          <h1 className="text-xl font-bold">{(emp as { full_name: string }).full_name}</h1>
          <p className="text-sm text-ink-2">Édite tous les champs admin et les contraintes planning.</p>
        </div>
        <div className="p-5">
          <EmployeeAdminForm
            employee={emp as never}
            departments={depts ?? []}
            managers={managers ?? []}
          />
        </div>
      </Card>
    </div>
  );
}
