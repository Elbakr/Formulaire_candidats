import { fetchApplications, fetchOpenJobs } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { CandidatesTable } from "./candidates-table";
import { NewCandidateButton } from "./new-candidate-button";
import { ExportCandidatesButton } from "./export-button";

export default async function RhCandidatesPage() {
  const supabase = await createClient();
  const [apps, jobs, { data: tmpls }] = await Promise.all([
    fetchApplications(),
    fetchOpenJobs(),
    supabase.from("email_templates").select("slug, label, subject, body_html, needs_dates, needs_times")
      .eq("is_active", true).order("label"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Candidats</h1>
          <p className="text-sm text-ink-2">{apps.length} candidatures · sync temps réel · sélectionne plusieurs candidats pour envoyer un email en masse.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportCandidatesButton />
          <NewCandidateButton jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
        </div>
      </div>
      <CandidatesTable initialData={apps} templates={(tmpls ?? []) as never} />
    </div>
  );
}
