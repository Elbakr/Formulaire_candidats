"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BadgeCheck, Send, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { prevalidateExistingCandidateAction } from "../prevalidated-actions";

/**
 * Karim 2026-07-07 : bouton « Candidat pré-validé » sur la fiche candidat.
 * Au clic → dialog avec un champ e-mail (pré-rempli) → promeut le candidat pré-validé
 * + envoie le lien /contract-info/{token} pour qu'il complète son dossier d'embauche.
 * Envoi MANUEL 1-clic (jamais bloqué par le kill-switch).
 */
export function PrevalidateButton({
  candidateId,
  applicationId,
  candidateName,
  currentEmail,
  alreadyPrevalidated,
}: {
  candidateId: string;
  applicationId: string;
  candidateName: string;
  currentEmail: string | null;
  alreadyPrevalidated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [pending, startTransition] = useTransition();
  const [prevalidatedId, setPrevalidatedId] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const r = await prevalidateExistingCandidateAction({
        candidateId,
        email: email.trim(),
        applicationId,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Échec de la pré-validation.");
        return;
      }
      setPrevalidatedId(candidateId);
      toast.success("Candidat pré-validé — e-mail d'invitation envoyé.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant={alreadyPrevalidated ? "outline" : "gold"}
        size="sm"
        onClick={() => {
          setEmail(currentEmail ?? "");
          setOpen(true);
        }}
        title={
          alreadyPrevalidated
            ? "Déjà pré-validé — renvoyer l'invitation à compléter le dossier"
            : "Pré-valide ce candidat et lui envoie le lien pour compléter son dossier d'embauche"
        }
      >
        <BadgeCheck className="h-3.5 w-3.5" />
        {alreadyPrevalidated ? "Renvoyer l'invitation" : "Candidat pré-validé"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {alreadyPrevalidated ? "Renvoyer l'invitation" : "Pré-valider"} — {candidateName}
            </DialogTitle>
            <DialogDescription>
              Le candidat recevra un e-mail avec un lien sécurisé pour compléter et
              confirmer sa fiche (dossier d'embauche). L'adresse est enregistrée sur sa fiche.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-3 text-sm">
            <div>
              <Label htmlFor="prevalidate_email">E-mail du candidat</Label>
              <Input
                id="prevalidate_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.com"
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                variant="gold"
                loading={pending}
                disabled={pending || !email.trim()}
                onClick={submit}
              >
                <Send className="h-3.5 w-3.5" />
                {alreadyPrevalidated ? "Renvoyer le lien" : "Pré-valider et envoyer"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {prevalidatedId ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/rh/candidates/prevalidated/${prevalidatedId}`}>
            Voir le dossier pré-validé
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null}
    </>
  );
}
