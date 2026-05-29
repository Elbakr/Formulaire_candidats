"use client";

import { useState, useTransition } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "../actions";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const res = await requestPasswordResetAction(fd);
      if (res.error) { toast.error(res.error); return; }
      setSent(true);
      toast.success("Mail de réinitialisation envoyé.");
    });
  }

  if (sent) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
        <h2 className="font-bold text-sm text-emerald-900 mb-1">Mail envoyé !</h2>
        <p className="text-xs text-emerald-800">
          Vérifie ta boîte de réception à <span className="font-mono">{email}</span>.
          <br />Clique sur le lien dans le mail pour définir ton nouveau mot de passe.
        </p>
        <p className="text-[10px] text-ink-3 mt-2 italic">
          Pas reçu ? Vérifie les spams ou demande à nouveau dans 1 min.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-4 space-y-3">
      <div>
        <Label htmlFor="email" className="text-xs font-bold">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="elbazikarim@gmail.com"
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={pending || !email} className="w-full">
        <Mail className="h-3.5 w-3.5" />
        {pending ? "Envoi…" : "Envoyer le lien de réinitialisation"}
      </Button>
    </form>
  );
}
