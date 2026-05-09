import { fetchApplications } from "@/lib/queries";
import { requireRole } from "@/lib/auth";
import { CandidatesTable } from "../../rh/candidates/candidates-table";

export default async function ManagerCandidatesPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const apps = await fetchApplications({ managerId: profile.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mes candidats</h1>
        <p className="text-sm text-ink-2">{apps.length} candidat·e·s assigné·e·s.</p>
      </div>
      <CandidatesTable initialData={apps} />
    </div>
  );
}
