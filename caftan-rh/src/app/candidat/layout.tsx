import Link from "next/link";
import { LogOut } from "lucide-react";
import { BRAND } from "@/lib/config";
import { candidatLogoutAction } from "./login/actions";

// Espace candidat : layout clair, autonome (pas l'app-shell staff).
export default function CandidatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ colorScheme: "light" }} className="min-h-screen bg-canvas flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-xl text-white pt-safe px-safe">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          <Link href="/candidat" className="text-gold font-bold uppercase tracking-[0.1em] text-xs">
            {BRAND.name}
          </Link>
          <form action={candidatLogoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" /> Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <footer className="border-t border-line py-6 text-center text-[11px] text-ink-3">
        © {new Date().getFullYear()} {BRAND.name} · By AMD Megastore
      </footer>
    </div>
  );
}
