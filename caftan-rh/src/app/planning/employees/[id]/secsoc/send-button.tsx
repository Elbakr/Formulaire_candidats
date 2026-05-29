"use client";

/**
 * Karim 29/05 : bouton client "Envoyer au secretariat social".
 * Toujours en mode "preview avant envoi" : modal qui montre destinataire +
 * objet + corps du mail. Karim valide chaque envoi (regle metier).
 *
 * Pattern : un bouton par entite (AMD Megastore, Caftan Factory). Le clic
 *   1) appelle sendSecsocFicheAction pour preparer le payload
 *   2) ouvre la modal de preview
 *   3) au "Confirmer envoi", utilise sendEmailViaEmailJS cote client
 *      (vars NEXT_PUBLIC_EMAILJS_*)
 *   4) appelle recordSecsocSendAction pour l'audit
 */

import { useState, useTransition } from "react";
import { Mail, Send, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendEmailViaEmailJS } from "@/lib/emailjs-client";
import {
  sendSecsocFicheAction,
  recordSecsocSendAction,
  type SecsocOrg,
} from "./actions";

type Preview = {
  to: string;
  subject: string;
  body: string;
  orgKey: SecsocOrg;
  orgName: string;
  employeeName: string;
};

export function SecsocSendButton({
  employeeId,
  orgKey,
  orgLabel,
}: {
  employeeId: string;
  orgKey: SecsocOrg;
  orgLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  function openPreview() {
    startTransition(async () => {
      const r = await sendSecsocFicheAction(employeeId, orgKey);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPreview({
        to: r.to,
        subject: r.subject,
        body: r.body,
        orgKey: r.orgKey,
        orgName: r.orgName,
        employeeName: r.employeeName,
      });
    });
  }

  async function confirmSend() {
    if (!preview) return;
    setSending(true);
    const toastId = toast.loading("Envoi en cours…");
    try {
      const r = await sendEmailViaEmailJS({
        to_email: preview.to,
        to_name: "Secretariat social",
        subject: preview.subject,
        body_text: preview.body,
        from_name: preview.orgName,
        reply_to: "hr@caftanfactory.com",
      });
      toast.dismiss(toastId);
      if (!r.ok) {
        toast.error(r.error ?? "Envoi echoue", { duration: 8000 });
        return;
      }
      // Audit best-effort
      const audit = await recordSecsocSendAction({
        employeeId,
        orgKey: preview.orgKey,
        to: preview.to,
        subject: preview.subject,
      });
      if (audit.error) {
        toast.warning(audit.error);
      } else {
        toast.success(
          `Fiche envoyee a ${preview.to} (${preview.orgName}).`,
        );
      }
      setPreview(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        variant="gold"
        size="sm"
        onClick={openPreview}
        disabled={pending || sending}
        title={`Envoyer la fiche au secretariat social (${orgLabel})`}
      >
        <Building2 className="h-3.5 w-3.5" />
        Envoyer ({orgLabel})
      </Button>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Preview avant envoi
            </DialogTitle>
            <DialogDescription>
              Verifie le destinataire et le contenu. Une fois envoye, le mail
              part vers le secretariat social.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3 text-sm">
              <div className="bg-surface-2 rounded-md p-3 space-y-1 text-xs">
                <div>
                  <span className="text-ink-3">A : </span>
                  <span className="font-bold font-mono">{preview.to}</span>
                </div>
                <div>
                  <span className="text-ink-3">Entite : </span>
                  <span className="font-bold">{preview.orgName}</span>
                </div>
                <div>
                  <span className="text-ink-3">Objet : </span>
                  <span className="font-bold">{preview.subject}</span>
                </div>
              </div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap bg-surface-2 rounded-md p-3 max-h-72 overflow-auto border border-line">
                {preview.body}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={sending}
            >
              Annuler
            </Button>
            <Button onClick={confirmSend} disabled={sending} variant="gold">
              <Send className="h-3.5 w-3.5" />
              {sending ? "Envoi…" : "Confirmer l'envoi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
