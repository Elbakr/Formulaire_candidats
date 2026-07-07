import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { ConductManager, type ConductItem } from "./conduct-manager";

export const dynamic = "force-dynamic";

// Karim 2026-07-07 : RÉFÉRENTIEL éditable « conduite & erreurs de débutant » pour
// les nouvelles recrues. Catalogue admin CRUD (ajout/modif/suppr/toggle/réordre).
// PAS d'envoi automatique — géré manuellement, servira plus tard à l'onboarding.

export default async function RecruitConductPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("recruit_conduct_items")
    .select("*")
    .order("category")
    .order("sort_order")
    .order("created_at");
  const items = (data ?? []) as ConductItem[];

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Conduite & erreurs de débutant (recrues)</h1>
        <p className="text-sm text-ink-2">
          Référentiel du comportement et de la performance attendus dès le 1<sup>er</sup> jour,
          et catalogue des erreurs de débutant à éviter en magasin. 100 % éditable par toi :
          ajoute, modifie, supprime, réordonne ou désactive chaque élément. Usage interne —
          aucun envoi automatique. Servira plus tard à l&apos;onboarding des nouvelles recrues.
        </p>
      </div>
      <ConductManager items={items} />
    </div>
  );
}
