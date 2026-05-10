"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { useRealtime } from "@/hooks/use-realtime";
import { decideTimeOffAction } from "../actions";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const AUTO_REASON_LABELS: Record<string, string> = {
  all_rules_passed: "Tous les critères respectés",
  preavis_too_short: "Préavis trop court",
  too_long: "Durée trop longue",
  in_blocked_period: "Période bloquée (soldes / Ramadan / fin d'année / mer-sam)",
  too_many_absents: "Trop d'absents simultanés sur le site",
  manual_override: "Décision manager",
};

type Req = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_at: string | null;
  created_at: string;
  auto_validated: boolean | null;
  auto_validation_reason: string | null;
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

  // Sépare auto-validées récentes (= "pour info, déjà fait") des autres.
  // On considère "récent" = approved + auto_validated + decided_at < 14j.
  const sinceMs = Date.now() - 14 * 86_400_000;
  const autoApproved = requests.filter(
    (r) =>
      r.status === "approved" &&
      r.auto_validated &&
      r.decided_at &&
      new Date(r.decided_at).getTime() >= sinceMs,
  );
  const others = requests.filter((r) => !autoApproved.includes(r));

  return (
    <div>
      {autoApproved.length > 0 ? (
        <div className="border-b border-line bg-success-light/30">
          <div className="p-3 text-xs font-bold uppercase tracking-wider text-success inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Auto-validées récemment (pour info)
          </div>
          <div className="divide-y divide-line/60">
            {autoApproved.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                kindLabels={kindLabels}
                pending={pending}
                onDecide={decide}
                readOnly
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {others.map((r) => (
          <RequestRow
            key={r.id}
            r={r}
            kindLabels={kindLabels}
            pending={pending}
            onDecide={decide}
          />
        ))}
      </div>
    </div>
  );
}

function RequestRow({
  r,
  kindLabels,
  pending,
  onDecide,
  readOnly,
}: {
  r: Req;
  kindLabels: Record<string, string>;
  pending: boolean;
  onDecide: (id: string, decision: "approved" | "rejected") => void;
  readOnly?: boolean;
}) {
  const days =
    Math.round(
      (new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86_400_000,
    ) + 1;
  const escalation =
    r.status === "pending" && r.auto_validation_reason
      ? AUTO_REASON_LABELS[r.auto_validation_reason] ?? r.auto_validation_reason
      : null;
  return (
    <div className="p-3 flex items-start gap-3 flex-wrap">
      <NameAvatar name={r.employee?.full_name ?? "?"} />
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{r.employee?.full_name ?? "—"}</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gold-light text-gold-dark">
            {kindLabels[r.kind] ?? r.kind}
          </span>
          <span
            className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}
          >
            {STATUS_LABELS[r.status]}
          </span>
          {r.status === "approved" && r.auto_validated ? (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-success-light text-success inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Auto-validé
            </span>
          ) : null}
        </div>
        <div className="text-xs text-ink-2 mt-1">
          Du {formatDate(r.start_date)} au {formatDate(r.end_date)} · {days} jour
          {days > 1 ? "s" : ""}
        </div>
        {r.reason ? <div className="text-xs text-ink-3 mt-1 italic">"{r.reason}"</div> : null}
        {escalation ? (
          <div className="text-[11px] text-warn mt-1 inline-flex items-center gap-1">
            <Info className="h-3 w-3" /> Raison de l'escalade : {escalation}
          </div>
        ) : null}
      </div>
      {r.status === "pending" && !readOnly ? (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="success"
            onClick={() => onDecide(r.id, "approved")}
            disabled={pending}
          >
            <Check className="h-3.5 w-3.5" /> Approuver
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDecide(r.id, "rejected")}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" /> Refuser
          </Button>
        </div>
      ) : null}
    </div>
  );
}
