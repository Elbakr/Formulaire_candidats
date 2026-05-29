// Karim 2026-05-29 : page "Mot de passe oublie" - demande l email et
// envoie un mail de reset via Supabase Auth.

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { ForgotPasswordForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Mail className="h-10 w-10 text-gold-dark mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
          <p className="text-sm text-ink-2 mt-2">
            Entre ton email — tu recevras un lien sécurisé pour définir un nouveau mot de passe.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="text-center mt-4">
          <Link href="/login" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Retour à la connexion
          </Link>
        </div>
      </div>
    </main>
  );
}
