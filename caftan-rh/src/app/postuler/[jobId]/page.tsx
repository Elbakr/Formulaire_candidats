import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplicationForm } from "../application-form";
import { BRAND } from "@/lib/config";
import { LangToggle } from "@/components/lang-toggle";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import type { Site } from "@/lib/sites-shared";

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
                {job.description}
              </p>
            ) : null}
            <p className="mt-3 text-[11px] text-ink-3">
              {t("apply.subtitle", locale)}
            </p>
          </div>
          <div className="p-4 md:p-5">
            <ApplicationForm
              jobId={isSpontaneous ? null : (job?.id ?? null)}
              locale={locale}
              sites={sites}
            />
          </div>
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
