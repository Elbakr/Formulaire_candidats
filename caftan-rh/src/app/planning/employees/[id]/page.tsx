import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";
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

  // Onboarding (best effort, ne pas casser la page si vide)
  const { data: runRaw } = await supabase
    .from("onboarding_runs")
    .select("id, started_at, completed_at")
    .eq("employee_id", id)
    .maybeSingle();
  const run = runRaw as unknown as { id: string; started_at: string; completed_at: string | null } | null;

  let onbDone = 0;
  let onbTotal = 0;
  if (run) {
    const { data: itemsData } = await supabase
      .from("onboarding_run_items")
      .select("id, done_at")
      .eq("run_id", run.id);
    const items = (itemsData ?? []) as unknown as Array<{ id: string; done_at: string | null }>;
    onbTotal = items.length;
    onbDone = items.filter((i) => i.done_at).length;
  }
  const onbPct = onbTotal === 0 ? 0 : Math.round((onbDone / onbTotal) * 100);

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

      <Card>
        <Link
          href={`/onboarding/${id}`}
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Onboarding</div>
            {run ? (
              <>
                <div className="text-xs text-ink-3">
                  {run.completed_at
                    ? `Terminé · ${onbDone}/${onbTotal} items`
                    : `${onbDone}/${onbTotal} items réalisés`}
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={onbPct >= 100 ? "h-full bg-success" : onbPct >= 50 ? "h-full bg-gold" : "h-full bg-warn"}
                    style={{ width: `${Math.min(100, onbPct)}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-xs text-ink-3">Aucun parcours d'onboarding démarré.</div>
            )}
          </div>
          <span className="font-mono font-extrabold text-sm text-ink-2 hidden md:inline">{onbPct}%</span>
          <ArrowRight className="h-4 w-4 text-ink-3" />
        </Link>
      </Card>
    </div>
  );
}
