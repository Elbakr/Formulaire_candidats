"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relancerVivierAction, rejeterVivierAction } from "./actions";

export function VivierActionsButtons({
  preInterviewId,
  applicationId,
  candidateName,
}: {
  preInterviewId: string;
  applicationId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [isPendingRelancer, startRelancer] = useTransition();
  const [isPendingRejeter, startRejeter] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRelancer() {
    setError(null);
    startRelancer(async () => {
      const res = await relancerVivierAction(preInterviewId, applicationId);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRejeter() {
    const confirmed = window.confirm(
      `Rejeter définitivement ${candidateName} ? Cette action est irréversible.`,
    );
    if (!confirmed) return;
    setError(null);
    startRejeter(async () => {
      const res = await rejeterVivierAction(preInterviewId, applicationId);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {error ? (
        <span className="text-[11px] text-danger font-semibold">{error}</span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={handleRelancer}
        disabled={isPendingRelancer || isPendingRejeter}
        title="Passer en shortlist (relancer le dossier)"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        Relancer
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRejeter}
        disabled={isPendingRelancer || isPendingRejeter}
        className="text-danger hover:border-danger hover:bg-danger/5"
        title="Rejeter définitivement"
      >
        <XCircle className="h-3.5 w-3.5" />
        Rejeter
      </Button>
    </div>
  );
}
