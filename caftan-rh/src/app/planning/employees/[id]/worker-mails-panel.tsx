"use client";

// Karim 2026-07-12 : ces mails ne partent plus automatiquement (seul le mail
// post-signature reste auto). L'admin les envoie MANUELLEMENT ici, 1 clic.

import { useTransition } from "react";
import { Mail, Loader2, FileText, HeartHandshake, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  sendOnboardingSheetManualAction,
  sendFollowupManualAction,
  sendOnboardingReminderManualAction,
} from "./worker-mails-actions";

function useSender() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; info?: string }>, okMsg: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) toast.success(r.info ?? okMsg);
        else if (r.info) toast.warning(r.info);
        else toast.error(r.error ?? "Échec de l'envoi.");
      } catch {
        toast.error("Échec de l'envoi.");
      }
    });
  return { pending, run };
}

export function WorkerMailsPanel({ employeeId }: { employeeId: string }) {
  const sheet = useSender();
  const followup = useSender();
  const reminder = useSender();
  const anyPending = sheet.pending || followup.pending || reminder.pending;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <Mail className="h-4 w-4 text-gold-dark" />
        Communications au travailleur
        <span className="text-[10px] font-normal text-ink-3">(envoi manuel — 1 clic)</span>
      </div>
      <p className="text-[11px] text-ink-2 leading-snug">
        Ces mails ne partent plus automatiquement : seul le mail lié à la signature du contrat est
        automatique. Tu déclenches les autres ici, quand tu le décides.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={anyPending}
          onClick={() => sheet.run(() => sendOnboardingSheetManualAction(employeeId), "Fiche d'onboarding envoyée.")}
        >
          {sheet.pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
          Fiche d&apos;onboarding
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={anyPending}
          onClick={() => followup.run(() => sendFollowupManualAction(employeeId), "Mail de suivi envoyé.")}
        >
          {followup.pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <HeartHandshake className="h-3.5 w-3.5 mr-1" />}
          Mail de suivi (palier dû)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={anyPending}
          onClick={() =>
            reminder.run(() => sendOnboardingReminderManualAction(employeeId), "Relance questionnaire envoyée.")
          }
        >
          {reminder.pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BellRing className="h-3.5 w-3.5 mr-1" />}
          Relancer le questionnaire
        </Button>
      </div>
    </Card>
  );
}
