"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Printer,
  ArrowLeft,
  CheckCircle2,
  PenLine,
  ShieldCheck,
  Copy,
  Check,
  Mail,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  markContractReadyAction,
  markContractSignedAction,
} from "../../contract-actions";

type Status = "draft" | "ready_to_sign" | "signed" | "archived";

export function ContractBar({
  contractId,
  employeeId,
  status,
}: {
  contractId: string;
  employeeId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmReady, setConfirmReady] = useState(false);
  const [confirmSign, setConfirmSign] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function doReady() {
    startTransition(async () => {
      const r = await markContractReadyAction(contractId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Contrat marqué prêt à signer.");
      setConfirmReady(false);
      router.refresh();
    });
  }

  function doSign() {
    startTransition(async () => {
      const r = await markContractSignedAction(contractId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Contrat signé.");
      setConfirmSign(false);
      if (r.credentials) {
        setCreds(r.credentials);
        setCredsOpen(true);
      } else {
        router.refresh();
      }
    });
  }

  function copyCreds() {
    if (!creds) return;
    const text = `Bonjour,\n\nVoici ton accès à la plateforme Caftan Factory :\n\n  URL    : ${typeof window !== "undefined" ? window.location.origin : ""}/login\n  Email  : ${creds.email}\n  Pwd    : ${creds.password}\n\nÀ ta première connexion, change le mot de passe dans /me/profile.`;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success("Identifiants copiés.");
      },
      () => toast.error("Impossible de copier."),
    );
  }

  function shareWa() {
    if (!creds) return;
    const text = `Bonjour, voici ton accès Caftan Factory :\nURL: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${creds.email}\nPwd: ${creds.password}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function shareMail() {
    if (!creds) return;
    const subject = "Ton accès à la plateforme Caftan Factory";
    const body = `Bonjour,\n\nVoici tes identifiants pour accéder à la plateforme Caftan Factory :\n\nURL    : ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail  : ${creds.email}\nMot de passe : ${creds.password}\n\nMerci de changer ton mot de passe à la première connexion.\n\nL'équipe RH`;
    window.location.href = `mailto:${creds.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function closeCredsAndGoBack() {
    setCredsOpen(false);
    router.push(`/planning/employees/${employeeId}`);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 print:hidden flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/planning/employees/${employeeId}/contract`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux contrats
          </Link>
        </Button>
        <div className="flex gap-2 flex-wrap items-center">
          <Button asChild variant="outline" size="sm">
            <Link href={`/planning/employees/${employeeId}/dimona`}>
              <ShieldCheck className="h-3.5 w-3.5" /> Dimona ONSS
            </Link>
          </Button>

          {status === "draft" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReady(true)}
              disabled={pending}
            >
              <PenLine className="h-3.5 w-3.5" /> Marquer prêt à signer
            </Button>
          ) : null}

          {status === "ready_to_sign" ? (
            <Button
              variant="success"
              size="sm"
              onClick={() => setConfirmSign(true)}
              disabled={pending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Marquer signé
            </Button>
          ) : null}

          <Button
            variant="gold"
            size="sm"
            onClick={() => window.print()}
            title="Imprimer ou enregistrer en PDF"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
          </Button>
        </div>
      </div>

      {/* Confirm "ready to sign" */}
      <Dialog open={confirmReady} onOpenChange={setConfirmReady}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer prêt à signer ?</DialogTitle>
            <DialogDescription>
              Le contrat ne sera plus modifiable. Tu pourras toujours l&apos;imprimer pour signature.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReady(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="gold" onClick={doReady} disabled={pending}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm "signed" */}
      <Dialog open={confirmSign} onOpenChange={setConfirmSign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la signature du contrat ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive. Elle activera automatiquement le compte employé
              (création identifiants si pas encore fait), mettra à jour la date de début
              si nécessaire, et préparera l&apos;onboarding. À effectuer uniquement après que
              les deux parties ont signé sur papier.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSign(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="success" onClick={doSign} disabled={pending}>
              Oui, contrat signé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials dialog après signature (si compte créé à la volée) */}
      <Dialog open={credsOpen} onOpenChange={(o) => (o ? setCredsOpen(o) : closeCredsAndGoBack())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contrat signé. Compte employé créé.</DialogTitle>
            <DialogDescription>
              Voici les identifiants à transmettre à l&apos;employé. Ils ne seront plus affichés
              ensuite — note-les ou copie-les maintenant.
            </DialogDescription>
          </DialogHeader>
          {creds ? (
            <div className="space-y-3 py-2">
              <div className="bg-surface-2 rounded-md p-3 font-mono text-xs space-y-1.5">
                <div>
                  <span className="text-ink-3">URL : </span>
                  <span className="font-bold">
                    {typeof window !== "undefined" ? window.location.origin : ""}/login
                  </span>
                </div>
                <div>
                  <span className="text-ink-3">Email : </span>
                  <span className="font-bold">{creds.email}</span>
                </div>
                <div>
                  <span className="text-ink-3">Mot de passe : </span>
                  <span className="font-bold text-base bg-gold-light px-1 rounded">
                    {creds.password}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button onClick={copyCreds} variant="gold">
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copié" : "Copier tout"}
                </Button>
                <Button variant="outline" onClick={shareWa}>
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={shareMail}>
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeCredsAndGoBack}>
              Aller à la fiche employé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
