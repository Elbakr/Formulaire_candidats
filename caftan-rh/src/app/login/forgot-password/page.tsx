// Karim 2026-05-29 : page "Mot de passe oublie" - demande l email et
// envoie un mail de reset via EmailJS depuis hr@caftanfactory.com.

import Link from "next/link";
import { ArrowLeft, Mail, AlertTriangle } from "lucide-react";
import { ForgotPasswordForm } from "./forgot-form";

type SP = { error?: string };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
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
        {sp.error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>{sp.error}</strong><br />
              Demande un nouveau lien ci-dessous (les liens expirent au bout d&apos;1h).
            </div>
          </div>
        ) : null}
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
