"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { managerDecideSwapAction } from "@/app/me/swaps/actions";
import { formatDate } from "@/lib/utils";

type Swap = {
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
};

type ShiftCtx = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  position: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée — revue manager",
  rejected: "Refusée",
  auto_validated: "Auto-validée",
  manager_approved: "Validée par manager",
  manager_rejected: "Refusée par manager",
  cancelled: "Annulée",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warn-light text-warn",
  accepted: "bg-info-light text-info",
  rejected: "bg-danger-light text-danger",
  auto_validated: "bg-success-light text-success",
  manager_approved: "bg-success-light text-success",
  manager_rejected: "bg-danger-light text-danger",
  cancelled: "bg-surface-2 text-ink-3",
};

const REASON_LABEL: Record<string, string> = {
  target_on_leave: "Cible en congé",
  requester_on_leave: "Demandeur en congé",
  target_conflict: "Conflit horaire cible",
  requester_conflict: "Conflit horaire demandeur",
  position_mismatch: "Postes différents",
  target_quota_exceeded: "Quota cible dépassé",
  requester_quota_exceeded: "Quota demandeur dépassé",
};

export function SwapsAdminClient({
  swaps,
  shiftsCtx,
}: {
  swaps: Swap[];
  shiftsCtx: ShiftCtx[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const ctxById = useMemo(() => {
    const m = new Map<string, ShiftCtx>();
    for (const s of shiftsCtx) m.set(s.id, s);
    return m;
  }, [shiftsCtx]);

  function decide(id: string, decision: "approve" | "reject") {
    if (decision === "reject" && !confirm("Refuser cet échange ?")) return;
    startTransition(async () => {
      const r = await managerDecideSwapAction(id, decision);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(decision === "approve" ? "Échange validé." : "Échange refusé.");
        router.refresh();
      }
    });
  }

  function shiftLine(id: string | null): string {
    if (!id) return "—";
    const s = ctxById.get(id);
    if (!s) return "—";
    return `${formatDate(s.date)} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}${s.position ? ` (${s.position})` : ""}`;
  }

  const toReview = swaps.filter(
    (s) => s.needs_manager_review && (s.status === "accepted" || s.status === "pending"),
  );
  const others = swaps.filter((s) => !toReview.includes(s));

  return (
    <Tabs defaultValue="review">
      <TabsList>
        <TabsTrigger value="review">
          À arbitrer ({toReview.length})
        </TabsTrigger>
        <TabsTrigger value="all">Historique</TabsTrigger>
      </TabsList>
      <TabsContent value="review" className="mt-3">
        <Card>
          {toReview.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-3">
              Aucun arbitrage requis.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {toReview.map((sw) => (
                <SwapRow
                  key={sw.id}
                  swap={sw}
                  shiftLine={shiftLine}
                  pending={pending}
                  onDecide={decide}
                  showActions
                />
              ))}
            </div>
          )}
        </Card>
      </TabsContent>
      <TabsContent value="all" className="mt-3">
        <Card>
          {others.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-3">
              Aucun historique.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {others.map((sw) => (
                <SwapRow
                  key={sw.id}
                  swap={sw}
                  shiftLine={shiftLine}
                  pending={pending}
                  onDecide={decide}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function SwapRow({
  swap: sw,
  shiftLine,
  pending,
  onDecide,
  showActions,
}: {
  swap: Swap;
  shiftLine: (id: string | null) => string;
  pending: boolean;
  onDecide: (id: string, d: "approve" | "reject") => void;
  showActions: boolean;
}) {
  const reasons = (sw.manager_review_reason ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return (
    <div className="p-4 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[sw.status] ?? "bg-surface-2 text-ink-3"}`}
        >
          {STATUS_LABEL[sw.status] ?? sw.status}
        </span>
        <span className="text-sm font-bold">
          {sw.requester?.full_name ?? "—"}
          {" "}↔{" "}
          {sw.target?.full_name ?? "Couverture libre"}
        </span>
      </div>
      <div className="text-xs text-ink-2">
        Demandeur lâche : <strong>{shiftLine(sw.requester_shift_id)}</strong>
      </div>
      {sw.target_shift_id ? (
        <div className="text-xs text-ink-2">
          Cible lâche : <strong>{shiftLine(sw.target_shift_id)}</strong>
        </div>
      ) : (
        <div className="text-xs text-ink-3 italic">
          Couverture (pas d'échange réciproque)
        </div>
      )}
      {sw.reason ? (
        <div className="text-xs text-ink-3 italic">"{sw.reason}"</div>
      ) : null}
      {reasons.length > 0 ? (
        <div className="text-[11px] text-warn flex flex-wrap gap-1 pt-1">
          {reasons.map((r) => (
            <span
              key={r}
              className="px-1.5 py-0.5 rounded bg-warn-light"
              title={r}
            >
              {REASON_LABEL[r] ?? r}
            </span>
          ))}
        </div>
      ) : null}
      {showActions ? (
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="gold"
            onClick={() => onDecide(sw.id, "approve")}
            disabled={pending}
          >
            <Check className="h-3.5 w-3.5" /> Approuver
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide(sw.id, "reject")}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" /> Refuser
          </Button>
        </div>
      ) : null}
    </div>
  );
}
