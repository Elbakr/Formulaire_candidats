"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { Send, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { prepareWeekScheduleEmailsAction, logScheduleSentAction } from "../actions-broadcast";
import { toast } from "sonner";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

type Recipient = {
  employee_id: string;
  employee_email: string;
  employee_name: string;
  week_label: string;
  body_html: string;
  total_hours: number;
  shifts_count: number;
};

export function BroadcastScheduleButton({ weekISO }: { weekISO: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function loadPreview() {
    setOpen(true);
    setRecipients([]);
    setProgress(null);
    startTransition(async () => {
      const r = await prepareWeekScheduleEmailsAction(weekISO);
      if (r.error) { toast.error(r.error); setOpen(false); return; }
      setRecipients(r.payload ?? []);
    });
  }

  async function send() {
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      toast.error("EmailJS non configuré.");
      return;
    }
    setProgress({ done: 0, total: recipients.length });
    let sent = 0;
    const failures: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      try {
        const subject = `Ton planning ${r.week_label}`;
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
          to_email: r.employee_email,
          to_name: r.employee_name,
          from_name: FROM_NAME,
          reply_to: REPLY_TO,
          subject,
          message: r.body_html,
        }, { publicKey: PUBLIC_KEY });
        sent += 1;
        await logScheduleSentAction(r.employee_id, subject, r.body_html);
      } catch (e) {
        const err = (e as { text?: string; message?: string })?.text ?? (e as Error)?.message ?? "EmailJS error";
        failures.push(`${r.employee_name} (${err})`);
      }
      setProgress({ done: i + 1, total: recipients.length });
    }

    if (sent > 0) {
      toast.success(`${sent} planning(s) envoyé(s).${failures.length > 0 ? ` ${failures.length} échec(s).` : ""}`, { duration: 6000 });
    }
    if (failures.length > 0) {
      console.warn("Schedule send failures:", failures);
      toast.error(`Échecs : ${failures.slice(0, 3).join(" · ")}`, { duration: 8000 });
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={loadPreview} disabled={pending}>
        <Mail className="h-3.5 w-3.5" /> Envoyer aux employés
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Envoyer le planning à toute l&apos;équipe</DialogTitle>
            <DialogDescription>
              Chaque employé reçoit son propre planning par email — uniquement les employés ayant au moins un shift cette semaine.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 max-h-[50vh] overflow-y-auto">
            {pending && recipients.length === 0 ? (
              <p className="text-sm text-ink-3 text-center py-6">Préparation des emails…</p>
            ) : recipients.length === 0 ? (
              <p className="text-sm text-ink-3 text-center py-6">Aucun employé avec planning cette semaine.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recipients.map((r) => (
                  <li key={r.employee_id} className="py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <div className="font-bold">{r.employee_name}</div>
                      <div className="text-xs text-ink-3">{r.employee_email}</div>
                    </div>
                    <span className="text-xs font-mono">{r.shifts_count} shifts · {r.total_hours.toFixed(1)}h</span>
                  </li>
                ))}
              </ul>
            )}

            {progress ? (
              <div className="mt-3 text-xs text-ink-2">
                Envoi : {progress.done}/{progress.total}
                <div className="h-1.5 bg-line rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-gold transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="-mx-5 -mb-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={!!progress}>Annuler</Button>
            <Button variant="gold" onClick={send} disabled={recipients.length === 0 || !!progress}>
              <Send className="h-4 w-4" /> Envoyer à {recipients.length} employé{recipients.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
