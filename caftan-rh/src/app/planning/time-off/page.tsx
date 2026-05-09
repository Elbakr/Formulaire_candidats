import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { TimeOffPanel } from "./time-off-panel";

const KIND_LABELS: Record<string, string> = {
  vacation: "Vacances",
  sick: "Maladie",
  personal: "Personnel",
  unpaid: "Sans solde",
  other: "Autre",
};

export default async function PlanningTimeOffPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_off_requests")
    .select(`id, kind, start_date, end_date, reason, status, decided_at, created_at,
             employee:employees(id, full_name, job_title)`)
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as unknown as Array<{
    id: string;
    kind: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: "pending" | "approved" | "rejected" | "cancelled";
    decided_at: string | null;
    created_at: string;
    employee: { id: string; full_name: string; job_title: string | null } | null;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Congés</h1>
        <p className="text-sm text-ink-2">Demandes en attente et historique.</p>
      </div>
      <Card>
        <TimeOffPanel requests={requests} kindLabels={KIND_LABELS} />
      </Card>
    </div>
  );
}
