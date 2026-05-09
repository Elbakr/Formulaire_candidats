"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { importEmailAction } from "./actions";
import { toast } from "sonner";

export function ImportEmailForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"manual" | "raw">("manual");

  function submit(fd: FormData) {
    fd.set("mode", mode);
    startTransition(async () => {
      const r = await importEmailAction(fd);
      if (r?.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      if (r?.matched_application_id) {
        toast.success(`Email importé et rattaché au candidat (matching: ${r.matched_via}).`, { duration: 6000 });
        router.push(`/rh/candidates/${r.matched_application_id}`);
      } else {
        toast.success("Email importé. Non matché — disponible dans le bucket 'À attribuer'.", { duration: 8000 });
        router.push("/rh/messages/unmatched");
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="manual">
            <FileText className="h-3.5 w-3.5 mr-1" /> Mode Manuel (4 champs)
          </TabsTrigger>
          <TabsTrigger value="raw">
            <Inbox className="h-3.5 w-3.5 mr-1" /> Raw .eml
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="from_email">Adresse email du candidat *</Label>
              <Input
                id="from_email"
                name="from_email"
                type="email"
                placeholder="aya.baroudi@example.com"
                required={mode === "manual"}
              />
            </div>
            <div>
              <Label htmlFor="from_name">Nom du candidat (optionnel)</Label>
              <Input id="from_name" name="from_name" placeholder="Aya Baroudi" />
            </div>
          </div>
          <div>
            <Label htmlFor="subject">Sujet</Label>
            <Input id="subject" name="subject" placeholder="Re: [#APP-12345678] Invitation entretien — CaftanRH" />
          </div>
          <div>
            <Label htmlFor="received_at">Date de réception (optionnel)</Label>
            <Input id="received_at" name="received_at" type="datetime-local" />
          </div>
          <div>
            <Label htmlFor="body_text">Corps de l&apos;email *</Label>
            <Textarea
              id="body_text"
              name="body_text"
              rows={10}
              placeholder="Bonjour, oui je suis disponible le mardi à 14h. Cordialement..."
              required={mode === "manual"}
            />
          </div>
        </TabsContent>

        <TabsContent value="raw" className="space-y-3">
          <div>
            <Label htmlFor="raw">Contenu brut .eml (Ctrl+V depuis &laquo; Afficher l&apos;original &raquo; de Gmail)</Label>
            <Textarea
              id="raw"
              name="raw"
              rows={20}
              className="font-mono text-[11px]"
              placeholder={`Delivered-To: hr@caftanfactory.com\nFrom: aya.baroudi@example.com\nSubject: Re: [#APP-...] Invitation\nDate: ...\nMessage-ID: <...>\n\nBonjour, ...`}
              required={mode === "raw"}
            />
            <p className="text-[11px] text-ink-3 mt-1">
              Le système parse automatiquement les en-têtes (From, To, Subject, Message-ID, In-Reply-To,
              References, Date) et le corps. Les pièces jointes en base64 sont aussi récupérées si présentes.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" size="lg" disabled={pending}>
          {pending ? "Import en cours…" : "Importer cet email"}
        </Button>
      </div>
    </form>
  );
}
