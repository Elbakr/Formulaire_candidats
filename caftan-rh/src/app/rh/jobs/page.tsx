import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { JobsManager } from "./jobs-manager";

export default async function RhJobsPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const [{ data: jobs }, { data: depts }] = await Promise.all([
    supabase.from("jobs").select("id, title, location, contract_type, is_open, department_id, department:departments(name)").order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Offres d'emploi</h1>
        <p className="text-sm text-ink-2">Crée et gère les offres publiées sur la page de candidature.</p>
      </div>
      <Card>
        <JobsManager initialJobs={(jobs ?? []) as never} departments={depts ?? []} />
      </Card>
    </div>
  );
}
