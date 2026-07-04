import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { BaremesEditor } from "./baremes-editor";

export const dynamic = "force-dynamic";

// Karim 2026-07-04 : barèmes de salaire (plancher éditable). Le contrat pré-remplit
// le taux avec le barème résolu et refuse toute saisie en-dessous.

export default async function BaremesPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data } = await admin.from("wage_baremes").select("*").order("contract_kind").order("age_min", { nullsFirst: true });
  const rows = (data ?? []) as Array<{ id: string; contract_kind: string; age_min: number | null; age_max: number | null; hourly_rate: number; label: string | null }>;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Barèmes de salaire (plancher)</h1>
        <p className="text-sm text-ink-2">
          Ces montants pré-remplissent le taux du contrat et servent de <b>plancher</b> : l&apos;ajustement vers le haut est autorisé,
          jamais vers le bas. Valeurs 100 % éditables par toi (aucune valeur légale imposée par le système — tiens-les à jour selon la CP201).
        </p>
      </div>
      <BaremesEditor rows={rows} />
    </div>
  );
}
