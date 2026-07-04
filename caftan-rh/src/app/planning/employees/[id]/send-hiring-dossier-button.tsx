"use client";

import { useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendHiringDossierAction } from "./hiring-dossier-actions";

export function SendHiringDossierButton({ employeeId }: { employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="gold"
      size="sm"
      disabled={pending}
      title="Envoyer par mail toutes les données d'embauche + la carte d'identité (secrétariat social)"
      onClick={() => {
        if (!confirm("Envoyer le dossier d'embauche complet (identité, NISS, IBAN, contrat + carte d'identité) à hr@caftanfactory.com ?")) return;
        start(async () => {
          const r = await sendHiringDossierAction(employeeId);
          if (r.ok) toast.success(`Dossier d'embauche envoyé à ${r.sentTo}.`);
          else toast.error(r.error ?? "Échec de l'envoi.");
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Envoyer le dossier d&apos;embauche
    </Button>
  );
}
