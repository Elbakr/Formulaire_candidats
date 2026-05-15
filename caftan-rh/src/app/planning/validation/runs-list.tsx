"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closeValidationRunAction } from "./actions";

export type RunWithStats = {
  id: string;
  week_iso: string;
  site_id: string | null;
  created_by: string | null;
  created_at: string;
  deadline_at: string | null;
  obligation_reason: string | null;
  was_mandatory: boolean;
  was_bypassed: boolean;
  bypass_reason: string | null;
  status: "pending" | "closed" | "cancelled";
  stats: { accepted: number; refused: number; pending: number; cancelled: number };
};

export function RunsList({ runs }: { runs: RunWithStats[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (runs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-ink-3">
        Aucune demande de validation pour l instant.
      </div>
    );
  }

  function close(runId: string) {
    if (!confirm("Cloturer ce run ? Les employes ne pourront plus repondre.")) return;
    startTransition(async () => {
      const r = await closeValidationRunAction(runId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Run cloture.");
        router.refresh();
      }
    });
  }

  return (
    <ul className="divide-y divide-line">
      {runs.map((r) => {
        const total = r.stats.accepted + r.stats.refused + r.stats.pending + r.stats.cancelled;
        return (
          <li key={r.id} className="px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
            <div className="font-mono font-bold w-24 shrink-0">{r.week_iso}</div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                {r.was_mandatory ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                    r.was_bypassed
                      ? "bg-orange-100 text-orange-800 border-orange-300"
                      : "bg-warn-light text-warn border-warn/30"
                  }`}>
                    <AlertTriangle className="h-3 w-3" />
                    {r.was_bypassed ? "Bypass" : "Obligation"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 text-ink-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Facultatif
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  r.status === "pending"
                    ? "bg-gold-light text-gold-dark"
                    : r.status === "closed"
                      ? "bg-success-light text-success"
                      : "bg-surface-2 text-ink-3"
                }`}>
                  {r.status === "pending" ? "En cours" : r.status === "closed" ? "Cloture" : "Annule"}
                </span>
              </div>
              {r.obligation_reason ? (
                <div className="text-[10px] text-ink-3 italic max-w-md" title={r.obligation_reason}>
                  {r.obligation_reason}
                </div>
              ) : null}
              {r.was_bypassed && r.bypass_reason ? (
                <div className="text-[10px] text-orange-700">
                  Bypass : {r.bypass_reason}
                </div>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-0.5 text-success" title="Accepte">
                <CheckCircle className="h-3 w-3" /> {r.stats.accepted}
              </span>
              <span className="inline-flex items-center gap-0.5 text-danger" title="Refuse">
                <XCircle className="h-3 w-3" /> {r.stats.refused}
              </span>
              <span className="inline-flex items-center gap-0.5 text-ink-3" title="Sans reponse">
                <Clock className="h-3 w-3" /> {r.stats.pending}
              </span>
              <span className="inline-flex items-center gap-0.5 text-orange-700" title="Annule apres validation">
                <AlertTriangle className="h-3 w-3" /> {r.stats.cancelled}
              </span>
              <span className="text-ink-3">/ {total} total</span>
              {r.status === "pending" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => close(r.id)}
                  disabled={pending}
                  className="ml-2"
                >
                  <Lock className="h-3 w-3" /> Cloturer
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
