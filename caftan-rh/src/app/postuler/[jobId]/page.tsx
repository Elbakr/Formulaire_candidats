import Link from "next/link";
import { ArrowLeft, MapPin, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationForm } from "../application-form";
import { BRAND } from "@/lib/config";
import { LangToggle } from "@/components/lang-toggle";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import type { Site } from "@/lib/sites-shared";

function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

type JobRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  contract_type: string | null;
  is_open: boolean;
};

export default async function PostulerJobPage(
  props: PageProps<"/postuler/[jobId]">,
) {
  const { jobId } = await props.params;
  const isSpontaneous = jobId === "spontanee";
  const locale = await getLocale();

  const supabase = await createClient();

  // Charge job (sauf si spontanée).
  let job: JobRow | null = null;
  if (!isSpontaneous) {
    const { data } = await supabase
      .from("jobs")
      .select("id, title, description, location, contract_type, is_open")
      .eq("id", jobId)
      .maybeSingle();
    const row = data as JobRow | null;
    if (row && row.is_open) job = row;
  }

  // Charge sites publics (lecture publique autorisée par RLS sites_read).
  const { data: sitesData } = await supabase
    .from("sites")
    .select(
      "id, code, name, abbr, city, address, color, light_color, sort_order, is_active",
    )
    .eq("is_active", true)
    .order("sort_order");
  const sites = (sitesData ?? []) as Site[];

  // Karim 2026-06-13 (Phase 1, "point A") : le DÉTAIL d'une offre et la
  // candidature ne sont accessibles qu'à un candidat IDENTIFIÉ. Déconnecté =>
  // on montre un teaser + une porte d'inscription (lien magique). Connecté =>
  // détail complet + formulaire pré-rempli, candidature liée au compte.
  const { data: { user } } = await supabase.auth.getUser();
  let prefill: { firstname?: string; lastname?: string; email?: string } | undefined;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const parts = (prof?.full_name ?? "").trim().split(/\s+/);
    prefill = {
      firstname: parts[0] ?? "",
      lastname: parts.slice(1).join(" "),
      email: prof?.email ?? user.email ?? "",
    };
  }

  // Si offre demandée et introuvable → message friendly + CTA spontanée.
  if (!isSpontaneous && !job) {
    return (
      <main className="flex-1 min-h-screen bg-surface-2">
        <PublicHeader />
        <section className="mx-auto max-w-2xl px-4 py-10">
          <Card>
            <div className="p-6 text-center">
              <h1 className="text-xl font-bold">
                {t("apply.job.not_found_title", locale)}
              </h1>
              <p className="text-sm text-ink-2 mt-2">
                {t("apply.job.not_found_body", locale)}
              </p>
              <Button asChild variant="gold" className="mt-5">
                <Link href="/postuler/spontanee">
                  {t("apply.spontaneous_cta", locale)}
                </Link>
              </Button>
            </div>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-screen bg-surface-2">
      <PublicHeader />

      <section className="mx-auto max-w-2xl px-4 py-6 md:py-10">
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-line bg-surface">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gold-dark">
              {isSpontaneous
                ? t("apply.title_spontaneous", locale)
                : t("apply.job.offer_label", locale)}
            </div>
            <h1 className="text-2xl font-bold mt-1 leading-tight">
              {job?.title ?? t("apply.title_spontaneous", locale)}
            </h1>
            {job ? (
              <div className="text-xs text-ink-2 mt-2 flex flex-wrap gap-3">
                {job.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {job.location}
                  </span>
                ) : null}
                {job.contract_type ? (
                  <span className="rounded-full bg-gold-light text-gold-dark px-2 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                    {job.contract_type}
                  </span>
                ) : null}
              </div>
            ) : null}
            {job?.description ? (
              <p className="mt-3 text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">
                {user ? job.description : excerpt(job.description)}
              </p>
            ) : null}
            {user ? (
              <p className="mt-3 text-[11px] text-ink-3">
                {t("apply.subtitle", locale)}
              </p>
            ) : null}
          </div>

          {user ? (
            <div className="p-4 md:p-5">
              <ApplicationForm
                jobId={isSpontaneous ? null : (job?.id ?? null)}
                locale={locale}
                sites={sites}
                prefill={prefill}
              />
            </div>
          ) : (
            <div className="p-5">
              <div className="rounded-xl border border-gold/40 bg-gold-light/40 p-5 text-center">
                <div className="inline-flex h-11 w-11 rounded-full bg-gold text-[#1a1a0d] items-center justify-center mb-3">
                  <Lock className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-ink">
                  {t("apply.gate.title", locale)}
                </h2>
                <p className="text-sm text-ink-2 mt-1">
                  {t("apply.gate.body", locale)}
                </p>
                <Button asChild variant="gold" className="mt-4 w-full sm:w-auto">
                  <Link href={`/candidat/login?next=${encodeURIComponent(`/postuler/${isSpontaneous ? "spontanee" : (job?.id ?? "spontanee")}`)}`}>
                    {t("apply.gate.cta", locale)}
                  </Link>
                </Button>
                <p className="text-[11px] text-ink-3 mt-3">{t("apply.gate.note", locale)}</p>
              </div>
            </div>
          )}
        </Card>
      </section>

      <footer className="border-t border-line py-6 text-center text-[11px] text-ink-3 bg-ink/95 text-white/60">
        © {new Date().getFullYear()} {BRAND.name} · RGPD / GDPR
      </footer>
    </main>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-xl text-white">
      <div className="mx-auto max-w-2xl flex items-center justify-between px-4 py-3 gap-3">
        <Link
          href="/postuler"
          className="text-gold font-bold uppercase tracking-[0.1em] text-xs inline-flex items-center gap-1.5 min-w-0 truncate"
        >
          <ArrowLeft className="h-3 w-3 shrink-0" />
          <span className="truncate">{BRAND.name}</span>
        </Link>
        <LangToggle />
      </div>
    </header>
  );
}
