import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/config";
import { ArrowRight, Briefcase, Users, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-xl text-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-5 py-3">
          <div className="text-gold font-bold uppercase tracking-[0.1em] text-xs">{BRAND.name}</div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white">
              <Link href="/postuler">Postuler</Link>
            </Button>
            <Button asChild variant="gold">
              <Link href="/login">Se connecter</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pt-20 pb-16 text-center">
        <div className="inline-block bg-gold-light text-gold-dark text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-5">
          {BRAND.tagline}
        </div>
        <h1 className="text-balance text-4xl md:text-6xl font-bold leading-[1.05]">
          Le recrutement, <span className="text-gold-dark">enfin fluide</span>.
        </h1>
        <p className="mt-5 text-ink-2 text-lg max-w-2xl mx-auto text-balance">
          Une plateforme moderne pour gérer candidats, entretiens et embauches —
          synchronisée en temps réel entre RH, managers et candidats.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Button asChild variant="gold" size="lg">
            <Link href="/postuler">
              Postuler à une offre <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Espace recruteur</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 grid md:grid-cols-3 gap-5">
        {[
          { icon: Users, title: "Pipeline temps réel", desc: "Tous les recruteurs voient les mêmes données instantanément, sans rafraîchir." },
          { icon: Briefcase, title: "Multi-rôles", desc: "RH, managers, candidats — chacun voit ce qui le concerne, rien de plus." },
          { icon: MessageSquare, title: "Communication centralisée", desc: "Templates d'emails, historique, rappels automatiques." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-[var(--radius)] bg-surface p-6 border border-line">
            <div className="w-10 h-10 rounded-lg bg-gold-light text-gold-dark flex items-center justify-center mb-3">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base mb-1">{title}</h3>
            <p className="text-sm text-ink-2 leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-3">
        © {new Date().getFullYear()} {BRAND.name}
      </footer>
    </main>
  );
}
