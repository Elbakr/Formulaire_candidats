"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { Printer, MessageSquare, Phone, Mail } from "lucide-react";
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
import {
  getPlanningRecapAction,
  sharePlanningViaDmAction,
  sendWhatsAppToEmployeeAction,
} from "./share-actions";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

type Recap = {
  text: string;
  weekLabel: string;
  totalHours: number;
  shiftsCount: number;
  employeeName: string;
  employeeEmail: string | null;
  hasPhone: boolean;
  hasProfile: boolean;
};

/**
 * Dialog "Partager le planning" — accessible côté admin/RH/manager via la
 * page calendrier d'un employé, ET côté employé sur `/me/planning` (mode
 * `isSelf` qui désactive DM et WhatsApp et auto-remplit l'email).
 */
export function ShareDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  weekISO,
  isSelf = false,
  selfEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  weekISO: string;
  /** Si true, l'utilisateur est l'employé lui-même → pas de DM, pas de WhatsApp envoyé par RH */
  isSelf?: boolean;
  /** Email pré-rempli (cas isSelf) — sinon récupéré du serveur. */
  selfEmail?: string | null;
}) {
  const router = useRouter();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setRecap(null);
    setLoading(true);
    getPlanningRecapAction({ employeeId, weekISO }).then((r) => {
      setLoading(false);
      if (r.error || !r.ok) {
        toast.error(r.error ?? "Récap indisponible.");
        return;
      }
      setRecap({
        text: r.text!,
        weekLabel: r.weekLabel!,
        totalHours: r.totalHours ?? 0,
        shiftsCount: r.shiftsCount ?? 0,
        employeeName: r.employeeName ?? employeeName,
        employeeEmail: r.employeeEmail ?? null,
        hasPhone: r.hasPhone ?? false,
        hasProfile: r.hasProfile ?? false,
      });
    });
  }, [open, employeeId, weekISO, employeeName]);

  function doPrint() {
    onOpenChange(false);
    // Le @media print global cache la nav et garde la grille planning. Le
    // simple appel à window.print suffit — ImpressionRH accepte n'importe
    // quelle imprimante via le dialog navigateur.
    setTimeout(() => window.print(), 100);
  }

  async function doDm() {
    if (isSelf) return;
    startTransition(async () => {
      const r = await sharePlanningViaDmAction({ employeeId, weekISO });
      if (r.error || !r.ok) {
        toast.error(r.error ?? "Envoi DM impossible.");
        return;
      }
      toast.success("Planning envoyé en DM.");
      onOpenChange(false);
      if (r.roomId) router.push(`/chat/${r.roomId}`);
    });
  }

  async function doWhatsApp() {
    if (isSelf) return;
    if (!recap?.hasPhone) {
      toast.error("Numéro de téléphone non disponible pour cet employé.");
      return;
    }
    startTransition(async () => {
      const r = await sendWhatsAppToEmployeeAction({ employeeId, weekISO });
      if (r.error || !r.ok) {
        toast.error(r.error ?? "Envoi WhatsApp impossible.");
        return;
      }
      toast.success(`WhatsApp envoyé à ${r.recipient}.`);
      onOpenChange(false);
    });
  }

  async function doEmail() {
    if (!recap) return;
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      toast.error("EmailJS non configuré.");
      return;
    }
    const targetEmail = isSelf ? selfEmail ?? recap.employeeEmail : recap.employeeEmail;
    if (!targetEmail) {
      toast.error("Adresse email non disponible.");
      return;
    }
    const subject = `Ton planning de la semaine ${recap.weekLabel}`;
    // Body texte (pas HTML lourd) — converti pour affichage simple.
    const messageHtml = recap.text
      .split("\n")
      .map((l) => `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`)
      .join("");
    try {
      await emailjs.send(
        SERVICE_ID,
        TEMPLATE_ID,
        {
          to_email: targetEmail,
          to_name: recap.employeeName,
          from_name: FROM_NAME,
          reply_to: REPLY_TO,
          subject,
          message: messageHtml,
        },
        { publicKey: PUBLIC_KEY },
      );
      toast.success(`Email envoyé à ${targetEmail}.`);
      onOpenChange(false);
    } catch (e) {
      const err =
        (e as { text?: string; message?: string })?.text ??
        (e as Error)?.message ??
        "EmailJS error";
      toast.error(`Échec de l'envoi email : ${err}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Partager le planning</DialogTitle>
          <DialogDescription>
            {recap
              ? `Semaine ${recap.weekLabel} · ${recap.shiftsCount} shift${recap.shiftsCount > 1 ? "s" : ""} · ${recap.totalHours.toFixed(1)}h`
              : "Chargement du récap…"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 space-y-3">
          {loading ? (
            <p className="text-sm text-ink-3 text-center py-4">Préparation…</p>
          ) : recap ? (
            <>
              <pre className="bg-surface-2 rounded-md p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {recap.text}
              </pre>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={doPrint}
                  className="flex-col h-auto py-3 gap-1"
                >
                  <Printer className="h-5 w-5" />
                  <span className="text-xs">Imprimer</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={doDm}
                  disabled={pending || isSelf || !recap.hasProfile}
                  className="flex-col h-auto py-3 gap-1"
                  title={
                    isSelf
                      ? "Pas de DM à soi-même"
                      : !recap.hasProfile
                        ? "L'employé n'a pas de compte messagerie"
                        : undefined
                  }
                >
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-xs">Chat interne</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={doWhatsApp}
                  disabled={pending || isSelf || !recap.hasPhone}
                  className="flex-col h-auto py-3 gap-1"
                  title={
                    isSelf
                      ? "Mode lecture — partage WhatsApp réservé aux managers"
                      : !recap.hasPhone
                        ? "Numéro non disponible"
                        : undefined
                  }
                >
                  <Phone className="h-5 w-5" />
                  <span className="text-xs">WhatsApp</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={doEmail}
                  disabled={pending || (!recap.employeeEmail && !selfEmail)}
                  className="flex-col h-auto py-3 gap-1"
                  title={
                    !recap.employeeEmail && !selfEmail
                      ? "Email non disponible"
                      : undefined
                  }
                >
                  <Mail className="h-5 w-5" />
                  <span className="text-xs">Email</span>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-danger text-center py-4">
              Récap non disponible.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
