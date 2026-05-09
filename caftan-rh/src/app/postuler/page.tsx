import Link from "next/link";
import { ArrowRight, MapPin, Briefcase } from "lucide-react";
import { fetchOpenJobs } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/config";

export default async function PostulerHomePage() {
  const jobs = await fetchOpenJobs();

  return (
    <main className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-xl text-white">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-5 py-3">
          <Link href="/" className="text-gold font-bold uppercase tracking-[0.1em] text-xs">{BRAND.name}</Link>
          <Button asChild variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white">
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-bold">Nos opportunités</h1>
        <p className="text-ink-2 mt-2">Choisis une offre ou postule de façon spontanée.</p>

        <div className="mt-8 space-y-3">
          {jobs.length === 0 ? (
            <div className="rounded-[var(--radius)] bg-surface border border-line p-6 text-center">
              <p className="text-sm text-ink-2">Aucune offre ouverte pour l'instant.</p>
              <Button asChild variant="gold" className="mt-3">
                <Link href="/postuler/spontanee">Candidature spontanée <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          ) : (
            jobs.map((j) => {
              const dept = (j.department as { name?: string } | null)?.name;
              return (
                <Link
                  key={j.id}
                  href={`/postuler/${j.id}`}
                  className="block rounded-[var(--radius)] bg-surface border border-line p-5 hover:border-gold transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg">{j.title}</div>
                      <div className="text-xs text-ink-2 mt-1 flex flex-wrap gap-2">
                        {dept ? <span>{dept}</span> : null}
                        {j.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</span> : null}
                        {j.contract_type ? <span className="rounded-full bg-gold-light text-gold-dark px-2 py-0.5 font-bold uppercase tracking-wider text-[10px]">{j.contract_type}</span> : null}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3 shrink-0 mt-2" />
                  </div>
                </Link>
              );
            })
          )}

          <Link
            href="/postuler/spontanee"
            className="block rounded-[var(--radius)] bg-surface-2 border border-dashed border-line p-5 hover:border-gold hover:bg-surface transition-colors text-center"
          >
            <div className="text-sm font-bold">Candidature spontanée</div>
            <div className="text-xs text-ink-3 mt-0.5">Tu ne trouves pas l'offre ? Envoie-nous quand même ton profil.</div>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-3">
        © {new Date().getFullYear()} {BRAND.name}
      </footer>
    </main>
  );
}
