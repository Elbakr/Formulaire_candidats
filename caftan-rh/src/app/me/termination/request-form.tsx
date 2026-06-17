"use client";

import { useState, useTransition } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { requestTerminationByEmployeeAction } from "@/app/planning/employees/[id]/termination-actions";

export function TerminationRequestForm() {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!confirm) {
      toast.error("Confirme que tu comprends les conséquences");
      return;
    }
    startTransition(async () => {
      const res = await requestTerminationByEmployeeAction({ reason: reason || undefined, immediate });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Demande envoyée. Date de fin prévue : ${res.data?.earliestEffectiveDate}`);
      // refresh la page pour afficher la carte "en cours"
      window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <FileSignature className="w-4 h-4" />
        Initier ma demande
      </div>
      <p className="text-xs text-muted-foreground">
        La demande sera soumise à validation RH/Admin. Aucune notification automatique de fin de contrat
        n&apos;est déclenchée tant qu&apos;elle n&apos;est pas validée et signée par les deux parties.
        <br />
        <strong>
          Délai minimum : 3 jours planifiés après ta demande (ou 4 jours si aucun planning n&apos;est défini).
        </strong>{" "}
        Sans demande d&apos;arrêt anticipé ci-dessous, la fin prendra effet à cette date.
      </p>

      <div>
        <Label>Motif (optionnel mais utile pour la RH)</Label>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex. nouvelle opportunité professionnelle, raisons personnelles..."
        />
      </div>

      <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md border border-amber-200 bg-amber-50 p-2">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-amber-900">
          <strong>Départ anticipé si possible.</strong> Si l&apos;organisation peut l&apos;absorber
          sans préjudice pour le service, je souhaite que mon départ prenne effet dans les meilleurs
          délais — idéalement immédiatement. Je comprends que l&apos;employeur décide, à son
          appréciation, d&apos;un arrêt immédiat ou de la date la plus proche possible.
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Je comprends que cette demande sera examinée par la RH et que la cessation
          de mon contrat ne sera effective qu&apos;après signature de la convention
          par les deux parties.
        </span>
      </label>

      <Button variant="danger" onClick={submit} disabled={pending || !confirm}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
        Envoyer ma demande
      </Button>
    </div>
  );
}
