import Link from "next/link";
import { LoginForm } from "./login-form";
import { BRAND } from "@/lib/config";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-gold-dark font-bold uppercase tracking-[0.1em] text-xs">{BRAND.name}</div>
          <h1 className="text-2xl font-bold mt-2">Connexion</h1>
          <p className="text-sm text-ink-2 mt-1">Accède à ton espace recruteur ou candidat.</p>
        </div>
        <LoginForm next={next} />
        <p className="text-center text-xs text-ink-2 mt-6">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-bold text-gold-dark hover:underline">
            Créer un compte
          </Link>
        </p>
        <p className="text-center text-xs text-ink-3 mt-2">
          <Link href="/" className="hover:text-ink-2">← retour à l'accueil</Link>
        </p>
      </div>
    </main>
  );
}
