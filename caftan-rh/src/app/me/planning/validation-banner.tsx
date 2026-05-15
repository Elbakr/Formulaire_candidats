"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, AlertTriangle, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  submitValidationResponseAction,
  cancelAfterValidationAction,
} from "@/app/planning/validation/actions";

export type EmployeeValidationRun = {
  run_id: string;
  week_iso: string;
  was_mandatory: boolean;
  was_bypassed: boolean;
  obligation_reason: string | null;
  deadline_at: string | null;
  response: "accepted" | "refused" | "no_response" | null;
  cancelled_after_validation: boolean;
  /** ID employee_id du lookup */
  employee_id: string;
};

export function EmployeeValidationBanner({
  run,
}: {
  run: EmployeeValidationRun;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRefuseInput, setShowRefuseInput] = useState(false);
  const [refuseNote, setRefuseNote] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function submit(response: "accepted" | "refused", notes?: string) {
    startTransition(async () => {
      const r = await submitValidationResponseAction({
        runId: run.run_id,
        employeeId: run.employee_id,
        response,
        notes,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(response === "accepted" ? "Planning validé. Merci !" : "Refus enregistré.");
        setShowRefuseInput(false);
        router.refresh();
      }
    });
  }

  function cancel() {
    if (!cancelReason || cancelReason.trim().length < 3) {
      toast.error("Raison requise (3 caractères min).");
      return;
    }
    startTransition(async () => {
      const r = await cancelAfterValidationAction({
        runId: run.run_id,
        employeeId: run.employee_id,
        reason: cancelReason.trim(),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Annulation enregistrée. Ton score sera impacté.");
        setShowCancelInput(false);
        router.refresh();
      }
    });
  }

  // Etat 1 : annulé après validation -> affichage neutre informatif
  if (run.cancelled_after_validation) {
    return (
      <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm">
        <div className="flex items-center gap-2 text-orange-800 font-bold">
          <AlertTriangle className="h-4 w-4" />
          Tu as annulé ta validation pour la semaine du {run.week_iso}
        </div>
        <p className="text-xs text-orange-700 mt-1">
          Cette annulation a été enregistrée et impactera ton score de fiabilité.
        </p>
      </div>
    );
  }

  // Etat 2 : déjà validé -> proposer annulation (avec score penalty)
  if (run.response === "accepted") {
    return (
      <div className="rounded-md border border-success/40 bg-success-light/30 p-3 text-sm space-y-2">
        <div className="flex items-center gap-2 text-success font-bold">
          <CheckCircle className="h-4 w-4" />
          Planning validé pour la semaine du {run.week_iso}
        </div>
        <p className="text-xs text-ink-2">
          Tu t es engagé sur ce planning. Si tu dois annuler un jour, signale-le
          maintenant — ton score de fiabilité en tiendra compte.
        </p>
        {showCancelInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Raison de l annulation (obligatoire)"
              className="flex-1 h-8 px-2 text-xs border border-line rounded"
            />
            <Button size="sm" variant="outline" onClick={cancel} disabled={pending}>
              Confirmer annulation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCancelInput(false)}>
              ✕
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCancelInput(true)}
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            <Undo2 className="h-3 w-3" /> Annuler ma validation (impact score)
          </Button>
        )}
      </div>
    );
  }

  // Etat 3 : déjà refusé
  if (run.response === "refused") {
    return (
      <div className="rounded-md border border-danger/40 bg-danger-light/30 p-3 text-sm">
        <div className="flex items-center gap-2 text-danger font-bold">
          <XCircle className="h-4 w-4" />
          Tu as refusé le planning de la semaine du {run.week_iso}
        </div>
        <p className="text-xs text-ink-2 mt-1">
          Le RH a été informé et va te recontacter pour ajuster.
        </p>
      </div>
    );
  }

  // Etat 4 : pas encore répondu — afficher la demande
  return (
    <div className={`rounded-md border-2 p-3 text-sm space-y-2 ${
      run.was_mandatory && !run.was_bypassed
        ? "border-warn bg-warn-light/30"
        : "border-gold bg-gold-light/30"
    }`}>
      <div className="flex items-center gap-2 font-bold">
        <ShieldCheck className="h-4 w-4 text-gold-dark" />
        <span>Validation demandée pour la semaine du {run.week_iso}</span>
        {run.was_mandatory ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warn-light text-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-warn/30">
            <AlertTriangle className="h-3 w-3" />
            Rush — validation obligatoire
          </span>
        ) : null}
      </div>
      {run.obligation_reason ? (
        <p className="text-xs text-ink-2 italic">{run.obligation_reason}</p>
      ) : null}
      <p className="text-xs text-ink-2">
        Confirme que tu peux tenir le planning de cette semaine. Si tu valides
        puis annules un jour plus tard, ton score de fiabilité diminue —
        pense à signaler dès maintenant si tu as un empêchement.
      </p>
      {showRefuseInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={refuseNote}
            onChange={(e) => setRefuseNote(e.target.value)}
            placeholder="Note (optionnel) : pourquoi tu refuses ?"
            className="flex-1 h-8 px-2 text-xs border border-line rounded"
          />
          <Button size="sm" variant="outline" onClick={() => submit("refused", refuseNote)} disabled={pending}>
            Confirmer refus
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowRefuseInput(false)}>
            ✕
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="gold" onClick={() => submit("accepted")} disabled={pending}>
            <CheckCircle className="h-3.5 w-3.5" /> J accepte ce planning
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRefuseInput(true)}
            className="border-danger text-danger hover:bg-danger-light"
          >
            <XCircle className="h-3.5 w-3.5" /> Je dois refuser
          </Button>
        </div>
      )}
    </div>
  );
}
