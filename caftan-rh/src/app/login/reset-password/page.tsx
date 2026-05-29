// Karim 2026-05-29 : page atterrissage apres clic sur le lien magique
// recu par mail. L user definit son nouveau mot de passe.

import { KeyRound } from "lucide-react";
import { ResetPasswordForm } from "./reset-form";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <KeyRound className="h-10 w-10 text-gold-dark mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
          <p className="text-sm text-ink-2 mt-2">
            Définis ton nouveau mot de passe (min 8 caractères).
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
