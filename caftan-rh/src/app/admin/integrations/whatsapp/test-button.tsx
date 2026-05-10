"use client";

import { useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { sendWhatsAppTestAction } from "@/app/rh/candidates/[id]/whatsapp-actions";

export function WhatsAppTestButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState(
    "Test WhatsApp depuis CaftanRH. Si vous lisez ceci, l'intégration fonctionne ✅",
  );
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="success" disabled={disabled} onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" /> Tester l&apos;envoi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Test d&apos;envoi WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-3">
            <div>
              <Label htmlFor="test_phone">Numéro destinataire (E.164)</Label>
              <Input
                id="test_phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+32468596100"
                className="font-mono"
              />
              <p className="text-[11px] text-ink-3 mt-1">
                En sandbox, le destinataire doit avoir rejoint la sandbox via le code
                <code> join &lt;mot&gt;</code>.
              </p>
            </div>
            <div>
              <Label htmlFor="test_body">Message</Label>
              <Textarea
                id="test_body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="gold"
              disabled={pending || !phone || !body}
              onClick={() =>
                startTransition(async () => {
                  const r = await sendWhatsAppTestAction({ toPhone: phone, body });
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success(`Envoyé. SID : ${r.sid?.slice(0, 12)}…`);
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
