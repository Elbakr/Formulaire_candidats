"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { useRealtime } from "@/hooks/use-realtime";
import { decideTimeOffAction } from "../actions";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type Req = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_at: string | null;
  created_at: string;
  employee: { id: string; full_name: string; job_title: string | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warn-light text-warn",
  approved: "bg-success-light text-success",
  rejected: "bg-danger-light text-danger",
  cancelled: "bg-surface-2 text-ink-3",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

export function TimeOffPanel({ requests, kindLabels }: { requests: Req[]; kindLabels: Record<string, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useRealtime("time_off_requests", () => router.refresh());

  function decide(id: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const r = await decideTimeOffAction(id, decision);
      if (r?.error) toast.error(r.error);
      else toast.success(decision === "approved" ? "Demande approuvée." : "Demande refusée.");
    });
  }

  if (requests.length === 0) {
    return <div className="p-10 text-center text-sm text-ink-3">Aucune demande de congé.</div>;
  }

  return (
    <div className="divide-y divide-line">
      {requests.map((r) => {
        const days = Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86_400_000) + 1;
        return (
          <div key={r.id} className="p-3 flex items-start gap-3 flex-wrap">
            <NameAvatar name={r.employee?.full_name ?? "?"} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{r.employee?.full_name ?? "—"}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gold-light text-gold-dark">
                  {kindLabels[r.kind] ?? r.kind}
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              <div className="text-xs text-ink-2 mt-1">
                Du {formatDate(r.start_date)} au {formatDate(r.end_date)} · {days} jour{days > 1 ? "s" : ""}
              </div>
              {r.reason ? <div className="text-xs text-ink-3 mt-1 italic">"{r.reason}"</div> : null}
            </div>
            {r.status === "pending" ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant="success" onClick={() => decide(r.id, "approved")} disabled={pending}>
                  <Check className="h-3.5 w-3.5" /> Approuver
                </Button>
                <Button size="sm" variant="danger" onClick={() => decide(r.id, "rejected")} disabled={pending}>
                  <X className="h-3.5 w-3.5" /> Refuser
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
