"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@supabase/ssr";
import { updatePasswordAction } from "../actions";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Karim 2026-05-29 : Supabase envoie le token dans le HASH FRAGMENT
  // (#access_token=...&refresh_token=...&type=recovery). Le serveur ne voit
  // pas le hash. On doit lire window.location.hash cote client et appeler
  // supabase.auth.setSession() avant que l action server-side puisse marcher.
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    // Cherche les tokens dans l URL hash
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    const errorDesc = params.get("error_description");

    if (errorDesc) {
      setSessionError(decodeURIComponent(errorDesc.replace(/\+/g, " ")));
      return;
    }

    if (type !== "recovery" || !accessToken || !refreshToken) {
      // Peut-etre l user est deja connecte (session active) - on verifie
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        } else {
          setSessionError("Lien invalide ou expiré. Demande un nouveau lien depuis /login/forgot-password.");
        }
      });
      return;
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setSessionError(error.message);
        } else {
          setSessionReady(true);
          // Nettoie le hash de l URL pour ne pas leak les tokens
          window.history.replaceState(null, "", window.location.pathname);
        }
      });
  }, []);

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

  if (sessionError) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
        <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto mb-2" />
        <h2 className="font-bold text-sm text-rose-900 mb-1">Lien invalide</h2>
        <p className="text-xs text-rose-800 mb-3">{sessionError}</p>
        <a href="/login/forgot-password" className="text-xs text-blue-700 hover:underline">
          Demander un nouveau lien
        </a>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="bg-surface border border-line rounded-lg p-4 text-center text-xs text-ink-3">
        Vérification du lien en cours…
      </div>
    );
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
