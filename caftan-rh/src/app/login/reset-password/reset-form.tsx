"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "../actions";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Min 8 caractères."); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas."); return; }
    const fd = new FormData();
    fd.set("password", password);
    fd.set("confirm", confirm);
    startTransition(async () => {
      const res = await updatePasswordAction(fd);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Mot de passe mis à jour. Tu es connecté.");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-4 space-y-3">
      <div>
        <Label htmlFor="password" className="text-xs font-bold">Nouveau mot de passe</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          minLength={8}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="confirm" className="text-xs font-bold">Confirmer</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        <Save className="h-3.5 w-3.5" />
        {pending ? "Enregistrement…" : "Définir le nouveau mot de passe"}
      </Button>
      <p className="text-[10px] text-ink-3 italic text-center">
        <KeyRound className="inline h-2.5 w-2.5" /> Astuce : mélange majuscules, minuscules, chiffres et symboles.
      </p>
    </form>
  );
}
