import { fetchApplications, fetchOpenJobs } from "@/lib/queries";
import { CandidatesTable } from "./candidates-table";
import { NewCandidateButton } from "./new-candidate-button";

export default async function RhCandidatesPage() {
  const [apps, jobs] = await Promise.all([fetchApplications(), fetchOpenJobs()]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Candidats</h1>
          <p className="text-sm text-ink-2">{apps.length} candidatures · sync temps réel.</p>
        </div>
        <NewCandidateButton jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} />
      </div>
      <CandidatesTable initialData={apps} />
    </div>
  );
}
