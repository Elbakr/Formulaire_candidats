import Link from "next/link";
import { SignupForm } from "./signup-form";
import { BRAND } from "@/lib/config";

export default function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-gold-dark font-bold uppercase tracking-[0.1em] text-xs">{BRAND.name}</div>
          <h1 className="text-2xl font-bold mt-2">Créer un compte</h1>
          <p className="text-sm text-ink-2 mt-1">
            Tu seras d'abord candidat. Un admin pourra te promouvoir RH/Manager.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-xs text-ink-2 mt-6">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-bold text-gold-dark hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
