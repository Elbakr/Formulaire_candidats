"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { Send, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { prepareEmailBatchAction, logEmailSentAction } from "@/app/rh/email/actions";
import { toast } from "sonner";

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

let emailjsInitialized = false;
function ensureEmailJSInit() {
  if (emailjsInitialized || !PUBLIC_KEY) return emailjsInitialized;
  try {
    emailjs.init({ publicKey: PUBLIC_KEY });
    emailjsInitialized = true;
  } catch (e) {
    console.warn("EmailJS init failed:", e);
  }
  return emailjsInitialized;
}

export function EmailSendDialog({
  open,
  onOpenChange,
  applicationIds,
  recipientPreview,
  templates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationIds: string[];
  recipientPreview: string;
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [slug, setSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [custom, setCustom] = useState("");
  const [dates, setDates] = useState("");
  const [times, setTimes] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const t = templates.find((x) => x.slug === slug);
    if (t) setSubject(t.subject);
  }, [slug, templates]);

  useEffect(() => {
    if (!open) {
      setSlug(""); setSubject(""); setCustom(""); setDates(""); setTimes("");
      setPreviewing(false); setProgress(null);
    }
  }, [open]);

  const tmpl = templates.find((x) => x.slug === slug);
  const showDates = tmpl?.needs_dates ?? false;
  const showTimes = tmpl?.needs_times ?? false;

  const emailjsConfigured = !!SERVICE_ID && !!TEMPLATE_ID && !!PUBLIC_KEY;

  async function send() {
    if (!slug) { toast.error("Choisis un template."); return; }
    if (!emailjsConfigured) {
      toast.error("EmailJS non configuré. Vérifie NEXT_PUBLIC_EMAILJS_* dans .env.local.");
      return;
    }

    startTransition(async () => {
      // 1) Prepare server-side (rendering avec variables, fetch destinataires)
      const prep = await prepareEmailBatchAction({
        applicationIds,
        templateSlug: slug,
        customMessage: custom || null,
        dates: dates || null,
        times: times || null,
        customSubject: subject || null,
      });
      if (prep.error || !prep.emails) {
        toast.error(prep.error ?? "Préparation échouée.");
        return;
      }

      ensureEmailJSInit();

      const total = prep.emails.length;
      setProgress({ done: 0, total });
      let sent = 0;
      const failures: Array<{ to: string; error: string }> = [];

      // 2) Pour chaque destinataire, envoyer via EmailJS (browser)
      for (let i = 0; i < prep.emails.length; i++) {
        const m = prep.emails[i];
        try {
          await emailjs.send(SERVICE_ID!, TEMPLATE_ID!, {
            to_email: m.to_email,
            to_name: m.to_name,
            from_name: FROM_NAME,
            reply_to: REPLY_TO,
            subject: m.subject,
            message: m.body,
          }, { publicKey: PUBLIC_KEY! });
          sent += 1;
          // Log success in messages table
          await logEmailSentAction(m.application_id, m.subject, m.body, "emailjs");
        } catch (e) {
          const err = (e as { text?: string; message?: string })?.text
            ?? (e as Error)?.message
            ?? "EmailJS error";
          failures.push({ to: m.to_email, error: err });
        }
        setProgress({ done: i + 1, total });
      }

      if (sent > 0) {
        toast.success(`${sent} email(s) envoyé(s).${failures.length > 0 ? ` ${failures.length} échec(s).` : ""}`, { duration: 6000 });
      }
      if (failures.length > 0) {
        console.warn("Email failures:", failures);
        toast.error(`Échecs : ${failures.slice(0, 3).map((f) => `${f.to} (${f.error})`).join(" · ")}`, { duration: 8000 });
      }
      if (prep.invalidCount && prep.invalidCount > 0) {
        toast.warning(`${prep.invalidCount} candidat(s) sans email — ignorés.`);
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer un email</DialogTitle>
          <DialogDescription>
            Destinataire(s) : {recipientPreview} ({applicationIds.length})
            {!emailjsConfigured ? <span className="block text-danger mt-1">⚠ EmailJS non configuré</span> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 space-y-3">
          <div>
            <Label>Template</Label>
            <Select value={slug} onValueChange={setSlug}>
              <SelectTrigger><SelectValue placeholder="— Choisir un template —" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tmpl ? (
            <>
              <div>
                <Label htmlFor="subject">Sujet (modifiable)</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              {(showDates || showTimes) ? (
                <div className="grid grid-cols-2 gap-3">
                  {showDates ? (
                    <div>
                      <Label htmlFor="dates">Dates proposées</Label>
                      <Input id="dates" value={dates} onChange={(e) => setDates(e.target.value)} placeholder="lundi 12/05 ou mardi 13/05" />
                    </div>
                  ) : null}
                  {showTimes ? (
                    <div>
                      <Label htmlFor="times">Horaires</Label>
                      <Input id="times" value={times} onChange={(e) => setTimes(e.target.value)} placeholder="10h00 / 14h00 / 17h00" />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <Label htmlFor="custom">Message personnalisé (optionnel)</Label>
                <Textarea id="custom" value={custom} onChange={(e) => setCustom(e.target.value)} rows={3} placeholder="Ajout libre qui sera inséré dans l'email." />
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewing(!previewing)}>
                  <Eye className="h-3.5 w-3.5" /> {previewing ? "Masquer aperçu" : "Voir aperçu"}
                </Button>
              </div>

              {previewing ? (
                <div className="rounded-md border border-line bg-surface-2 p-3 max-h-[300px] overflow-y-auto">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-2">Aperçu (variables non remplacées)</div>
                  <div className="text-xs font-bold mb-2">{subject}</div>
                  <div className="text-xs" dangerouslySetInnerHTML={{ __html: tmpl.body_html }} />
                </div>
              ) : null}

              {progress ? (
                <div className="text-xs text-ink-2">
                  Envoi en cours : <strong>{progress.done}/{progress.total}</strong>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-gold transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-center text-sm text-ink-3 py-4">Choisis un template pour continuer.</div>
          )}
        </div>

        <DialogFooter className="-mx-5 -mb-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuler</Button>
          <Button type="button" variant="gold" disabled={pending || !slug || !emailjsConfigured} onClick={send}>
            <Send className="h-4 w-4" /> {pending ? "Envoi…" : `Envoyer à ${applicationIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
