import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ApplicationForm } from "../application-form";
import { BRAND } from "@/lib/config";

export default async function PostulerJobPage(props: PageProps<"/postuler/[jobId]">) {
  const { jobId } = await props.params;
  const isSpontaneous = jobId === "spontanee";

  let job: { id: string; title: string; description: string | null; location: string | null; contract_type: string | null } | null = null;

  if (!isSpontaneous) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("jobs")
      .select("id, title, description, location, contract_type, is_open")
      .eq("id", jobId)
      .single();
    if (data && data.is_open) {
      job = data;
    }
  }

  return (
    <main className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-xl text-white">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-5 py-3">
          <Link href="/" className="text-gold font-bold uppercase tracking-[0.1em] text-xs">{BRAND.name}</Link>
          <Link href="/postuler" className="text-white/85 hover:text-white text-xs inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Toutes les offres
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <Card>
          <div className="p-5 border-b border-line">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gold-dark">
              {isSpontaneous ? "Candidature spontanée" : "Offre d'emploi"}
            </div>
            <h1 className="text-2xl font-bold mt-1">{job?.title ?? "Candidature spontanée"}</h1>
            {job ? (
              <div className="text-xs text-ink-2 mt-2 flex flex-wrap gap-3">
                {job.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location}</span> : null}
                {job.contract_type ? <span className="rounded-full bg-gold-light text-gold-dark px-2 py-0.5 font-bold uppercase tracking-wider text-[10px]">{job.contract_type}</span> : null}
              </div>
            ) : null}
            {job?.description ? (
              <p className="mt-3 text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{job.description}</p>
            ) : null}
          </div>
          <div className="p-5">
            <ApplicationForm jobId={isSpontaneous ? null : jobId} />
          </div>
        </Card>
      </section>
    </main>
  );
}
