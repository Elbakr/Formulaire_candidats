import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcquisitionConfigForm } from "./acquisition-config-form";
import { DEFAULT_ACQUISITION_CONFIG, type AcquisitionConfig } from "./types";

export default async function AcquisitionConfigPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("acquisition_config")
    .eq("id", 1)
    .maybeSingle();

  const stored = (data?.acquisition_config ?? {}) as Partial<AcquisitionConfig>;
  const initial: AcquisitionConfig = {
    min_score_to_hire: Number(
      stored.min_score_to_hire ?? DEFAULT_ACQUISITION_CONFIG.min_score_to_hire,
    ),
    pre_interview_relance_days: Number(
      stored.pre_interview_relance_days ??
        DEFAULT_ACQUISITION_CONFIG.pre_interview_relance_days,
    ),
    interview_planning_window_days: Number(
      stored.interview_planning_window_days ??
        DEFAULT_ACQUISITION_CONFIG.interview_planning_window_days,
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Configuration acquisition</h1>
          <p className="text-sm text-ink-2">
            Paramètres du pipeline candidat : seuil de score, relances pré-entretien et
            fenêtre de planification.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/settings">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paramètres
          </Link>
        </Button>
      </div>

      <Card>
        <AcquisitionConfigForm initial={initial} />
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-bold text-sm mb-2">À propos de ces paramètres</h2>
          <ul className="text-xs text-ink-3 space-y-1.5 list-disc list-inside">
            <li>
              <strong>Score minimum d'embauche</strong> — utilisé par le moteur de
              scoring du pré-entretien. Un score entre « seuil − 10 » et « seuil »
              donne la recommandation <em>MAYBE</em> ; en dessous, <em>PASS</em>.
            </li>
            <li>
              <strong>Délai de relance</strong> — déclenche un rappel automatique
              si le candidat n'a pas ouvert ou complété le pré-entretien dans ce
              délai après l'envoi du lien.
            </li>
            <li>
              <strong>Fenêtre d'entretien</strong> — nombre de jours ouvrables
              présentés au candidat pour choisir un créneau lors de la phase de
              planification de l'entretien physique.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
