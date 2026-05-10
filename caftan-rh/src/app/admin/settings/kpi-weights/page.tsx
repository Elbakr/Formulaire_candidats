import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiWeightsForm } from "./kpi-weights-form";
import { DEFAULT_KPI_WEIGHTS, type KpiWeights } from "./types";

export default async function KpiWeightsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("org_settings").select("kpi_weights").eq("id", 1).maybeSingle();
  const stored = (data?.kpi_weights ?? DEFAULT_KPI_WEIGHTS) as Partial<KpiWeights>;
  const initial: KpiWeights = {
    ponctualite: Number(stored.ponctualite ?? DEFAULT_KPI_WEIGHTS.ponctualite),
    fiabilite: Number(stored.fiabilite ?? DEFAULT_KPI_WEIGHTS.fiabilite),
    heures_vs_prevu: Number(stored.heures_vs_prevu ?? DEFAULT_KPI_WEIGHTS.heures_vs_prevu),
    absences: Number(stored.absences ?? DEFAULT_KPI_WEIGHTS.absences),
    rating_hebdo: Number(stored.rating_hebdo ?? DEFAULT_KPI_WEIGHTS.rating_hebdo),
    ventes: Number(stored.ventes ?? DEFAULT_KPI_WEIGHTS.ventes),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Pondération KPI</h1>
          <p className="text-sm text-ink-2">
            Définit comment le score global d'un employé est calculé. Le total doit faire 100. Modifiable à tout moment.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/settings">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paramètres
          </Link>
        </Button>
      </div>
      <Card>
        <KpiWeightsForm initial={initial} />
      </Card>
    </div>
  );
}
