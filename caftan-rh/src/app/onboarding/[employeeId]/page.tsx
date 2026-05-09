import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OnboardingDetail } from "./detail";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  start_date: string;
  status: string;
  department: { id: string; name: string } | null;
};

type Run = {
  id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
};

export type RunItem = {
  id: string;
  run_id: string;
  label: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  responsible_role: string;
  position: number;
  done_at: string | null;
  done_by: string | null;
  notes: string | null;
};

export default async function OnboardingEmployeePage(props: PageProps<"/onboarding/[employeeId]">) {
  const { employeeId } = await props.params;
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: empData } = await supabase
    .from("employees")
    .select("id, full_name, job_title, start_date, status, department:departments(id, name)")
    .eq("id", employeeId)
    .single();
  if (!empData) notFound();
  const employee = empData as unknown as Employee;

  const { data: runData } = await supabase
    .from("onboarding_runs")
    .select("id, employee_id, started_at, completed_at")
    .eq("employee_id", employeeId)
    .maybeSingle();
  const run = runData as unknown as Run | null;

  let items: RunItem[] = [];
  let doneByMap: Record<string, string> = {};
  if (run) {
    const { data: itemsData } = await supabase
      .from("onboarding_run_items")
      .select("id, run_id, label, description, category, is_required, responsible_role, position, done_at, done_by, notes")
      .eq("run_id", run.id)
      .order("position");
    items = ((itemsData ?? []) as unknown as RunItem[]);
    const doneByIds = Array.from(new Set(items.map((i) => i.done_by).filter((v): v is string => !!v)));
    if (doneByIds.length > 0) {
      const { data: prof } = await supabase.from("profiles").select("id, full_name").in("id", doneByIds);
      const profs = (prof ?? []) as unknown as Array<{ id: string; full_name: string | null }>;
      doneByMap = Object.fromEntries(profs.map((p) => [p.id, p.full_name ?? "—"]));
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/onboarding"><ArrowLeft className="h-3.5 w-3.5" /> Retour suivi</Link>
      </Button>
      {!run ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun onboarding pour cet employé. Le run aurait dû être créé automatiquement —
            assure-toi qu'un template est marqué par défaut dans <Link href="/onboarding/templates" className="text-gold-dark underline">Templates</Link>.
          </div>
        </Card>
      ) : (
        <OnboardingDetail
          employee={employee}
          run={run}
          items={items}
          doneByMap={doneByMap}
        />
      )}
    </div>
  );
}
