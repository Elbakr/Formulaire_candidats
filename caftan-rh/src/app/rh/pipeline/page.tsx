import { fetchApplications } from "@/lib/queries";
import { PipelineBoard } from "./pipeline-board";

export default async function RhPipelinePage() {
  const apps = await fetchApplications();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-ink-2">Glisse une carte pour changer son statut. Mises à jour temps réel.</p>
      </div>
      <PipelineBoard initialData={apps} />
    </div>
  );
}
