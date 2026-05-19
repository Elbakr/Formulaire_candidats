"use client";

import { useState, useTransition } from "react";
import { UserPlus, Copy, Check, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { sendEmailViaEmailJS } from "@/lib/emailjs-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inviteEmployeeAction } from "../actions-admin";

export function InviteEmployeeButton({
  employeeId,
  alreadyInvited,
}: {
  employeeId: string;
  alreadyInvited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function go() {
    setCreds(null);
    setCopied(false);
    setOpen(true);
    startTransition(async () => {
      const r = await inviteEmployeeAction(employeeId);
      if (r.error) {
        toast.error(r.error);
        setOpen(false);
        return;
      }
      if (r.email && r.password) {
        setCreds({ email: r.email, password: r.password });
      }
    });
  }

  function copyAll() {
    if (!creds) return;
    const text = `Bonjour,\n\nVoici ton accès à la plateforme Caftan Factory :\n\n  URL    : ${typeof window !== "undefined" ? window.location.origin : ""}/login\n  Email  : ${creds.email}\n  Pwd    : ${creds.password}\n\nÀ ta première connexion, change le mot de passe dans /me/profile.`;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success("Identifiants copiés. Colle-les dans WhatsApp/email à l'employé.");
      },
      () => toast.error("Impossible de copier."),
    );
  }

  function shareViaWhatsApp() {
    if (!creds) return;
    const text = `Bonjour, voici ton accès Caftan Factory :\nURL: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${creds.email}\nPwd: ${creds.password}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function shareViaMailto() {
    if (!creds) return;
    const subject = "Ton accès à la plateforme Caftan Factory";
    const body = `Bonjour,\n\nVoici tes identifiants pour accéder à la plateforme Caftan Factory :\n\nURL    : ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail  : ${creds.email}\nMot de passe : ${creds.password}\n\nMerci de changer ton mot de passe à la première connexion (page Mon profil).\n\nL'équipe RH`;
    // Karim 19/05 : envoi via messagerie integree EmailJS au lieu de mailto.
    const toastId = toast.loading("Envoi de l'email…");
    const r = await sendEmailViaEmailJS({
      to_email: creds.email, to_name: creds.email, subject, body_text: body,
    });
    toast.dismiss(toastId);
    if (r.ok) toast.success("Email envoyé via la messagerie intégrée.");
    else toast.error(r.error ?? "Envoi échoué", { duration: 8000 });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={go}
        disabled={pending}
        title={
          alreadyInvited
            ? "Compte déjà existant — réinitialiser le mot de passe via /me/profile"
            : "Crée un compte pour cet employé et génère un mot de passe à lui transmettre"
        }
      >
        <UserPlus className="h-3.5 w-3.5" />
        {alreadyInvited ? "Réinitialiser MDP" : "Inviter (créer compte)"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Identifiants employé</DialogTitle>
            <DialogDescription>
              Compte créé. Note ou copie ces identifiants — ils ne seront plus affichés.
              Transmets-les à l'employé par WhatsApp / email / en personne.
              L'employé pourra changer son mot de passe à la première connexion.
            </DialogDescription>
          </DialogHeader>

          {pending && !creds ? (
            <div className="text-center py-6 text-sm text-ink-2">
              Création en cours…
            </div>
          ) : creds ? (
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
                <Button onClick={copyAll} variant="gold">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copié" : "Copier tout"}
                </Button>
                <Button variant="outline" onClick={shareViaWhatsApp}>
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={shareViaMailto}>
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
