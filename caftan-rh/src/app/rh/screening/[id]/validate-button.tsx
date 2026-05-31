"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { validateScreeningAction } from "./actions";

export function ValidateScreeningButton({ responseId, alreadyValidated }: { responseId: string; alreadyValidated: boolean }) {
  const [pending, startTransition] = useTransition();
  if (alreadyValidated) {
    return (
      <div className="text-xs text-green-700 flex items-center gap-1">
        <CheckCircle2 className="w-4 h-4" /> Profile validé pour suite (contrat débloqué)
      </div>
    );
  }
  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await validateScreeningAction(responseId);
          if (!res.ok) toast.error(res.error ?? "Erreur");
          else toast.success("Validé - le contrat peut être envoyé");
        });
      }}
      size="sm"
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      {pending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
      Valider et débloquer le contrat
    </Button>
  );
}
