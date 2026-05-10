import { ArrowRightLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SwapsAdminClient } from "./client";

export default async function PlanningSwapsPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: swapsRaw } = await supabase
    .from("shift_swap_requests")
    .select(
      "id, requester_employee_id, requester_shift_id, target_employee_id, target_shift_id, status, reason, auto_validated, needs_manager_review, manager_review_reason, created_at, decided_at, requester:employees!shift_swap_requests_requester_employee_id_fkey(id, full_name), target:employees!shift_swap_requests_target_employee_id_fkey(id, full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const swaps = (swapsRaw ?? []) as unknown as Array<{
    id: string;
    requester_employee_id: string;
    requester_shift_id: string;
    target_employee_id: string | null;
    target_shift_id: string | null;
    status: string;
    reason: string | null;
    auto_validated: boolean | null;
    needs_manager_review: boolean | null;
    manager_review_reason: string | null;
    created_at: string;
    decided_at: string | null;
    requester: { id: string; full_name: string } | null;
    target: { id: string; full_name: string } | null;
  }>;

  const allShiftIds = Array.from(
    new Set(
      swaps.flatMap((s) =>
        [s.requester_shift_id, s.target_shift_id].filter(Boolean) as string[],
      ),
    ),
  );

  let shiftsCtx: Array<{
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
  }> = [];

  if (allShiftIds.length > 0) {
    const { data } = await supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, position")
      .in("id", allShiftIds);
    shiftsCtx = (data ?? []) as never;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ArrowRightLeft className="h-7 w-7 text-gold" />
        <div>
          <h1 className="text-2xl font-bold">Échanges de shifts</h1>
          <p className="text-sm text-ink-2">
            Arbitrage 1-clic des swaps qui n'ont pas pu être auto-validés.
          </p>
        </div>
      </div>

      {swaps.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3">
            <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aucun échange en cours.
          </div>
        </Card>
      ) : (
        <SwapsAdminClient swaps={swaps} shiftsCtx={shiftsCtx} />
      )}
    </div>
  );
}
