import { fetchApplications } from "@/lib/queries";
import { requireRole } from "@/lib/auth";
import { CandidatesTable } from "../rh/candidates/candidates-table";
import { Card } from "@/components/ui/card";

export default async function ManagerDashboardPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const apps = await fetchApplications({ managerId: profile.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mes candidats</h1>
        <p className="text-sm text-ink-2">
          Candidats qui te sont assignés ({apps.length}). Tu peux ajouter des notes et planifier des entretiens.
        </p>
      </div>

      {apps.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-ink-3">
            Aucun candidat ne t'est assigné pour l'instant. Le service RH t'attribuera des dossiers à examiner.
          </div>
        </Card>
      ) : (
        <CandidatesTable initialData={apps} />
      )}
    </div>
  );
}
