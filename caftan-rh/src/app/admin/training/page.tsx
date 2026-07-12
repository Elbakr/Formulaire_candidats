// Karim 2026-07-12 : éditeur admin du curriculum de formation.
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { TrainingManager, type ModuleRow } from "./training-manager";

export const dynamic = "force-dynamic";

export default async function AdminTrainingPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_modules")
    .select("id, seq, kind, category, title_fr, title_nl, body_fr, body_nl, exam_level, questions, is_active")
    .order("seq", { ascending: true });
  const modules = (data ?? []) as ModuleRow[];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Formation — curriculum</h1>
        <p className="text-sm text-ink-2">
          Édite le contenu (FR/NL), réordonne, ajoute des sections ou des examens. Les modifications sont
          prises en compte immédiatement pour les prochaines sections envoyées.
        </p>
      </div>
      <TrainingManager initial={modules} />
    </div>
  );
}
