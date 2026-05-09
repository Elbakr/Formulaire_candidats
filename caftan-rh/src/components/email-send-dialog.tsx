"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { sendCustomEmailAction } from "@/app/rh/email/actions";
import { toast } from "sonner";

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

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

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setSlug(""); setSubject(""); setCustom(""); setDates(""); setTimes(""); setPreviewing(false);
    }
  }, [open]);

  const tmpl = templates.find((x) => x.slug === slug);
  const showDates = tmpl?.needs_dates ?? false;
  const showTimes = tmpl?.needs_times ?? false;

  function send() {
    if (!slug) { toast.error("Choisis un template."); return; }
    startTransition(async () => {
      const r = await sendCustomEmailAction({
        applicationIds,
        templateSlug: slug,
        customMessage: custom || null,
        dates: dates || null,
        times: times || null,
        customSubject: subject || null,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${r.sent ?? 0} email(s) envoyé(s).${(r.failures?.length ?? 0) > 0 ? ` ${r.failures!.length} échec(s).` : ""}`, { duration: 6000 });
        if (r.failures && r.failures.length > 0) {
          console.warn("Send failures:", r.failures);
          toast.warning(r.failures.map((f) => f.error).slice(0, 3).join(" · "));
        }
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer un email</DialogTitle>
          <DialogDescription>
            Destinataire(s) : {recipientPreview} ({applicationIds.length})
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
            </>
          ) : (
            <div className="text-center text-sm text-ink-3 py-4">Choisis un template pour continuer.</div>
          )}
        </div>

        <DialogFooter className="-mx-5 -mb-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="button" variant="gold" disabled={pending || !slug} onClick={send}>
            <Send className="h-4 w-4" /> {pending ? "Envoi…" : `Envoyer à ${applicationIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
