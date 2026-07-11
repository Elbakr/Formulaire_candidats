"use server";

// Karim 2026-07-11 : bouton admin/rh « Générer les plannings pour tous ». Lance le
// MÊME batch global que le cron hebdomadaire (toutes les propositions régénérées en
// une fois, variante par défaut conservée). Interne : aucun envoi au travailleur.

import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { regenerateAllPlanningProposals } from "@/lib/scheduling/planning-proposal-store";
import { revalidatePath } from "next/cache";

export async function generateAllProposalsAction(): Promise<{
  ok: boolean;
  error?: string;
  total?: number;
  okCount?: number;
  alerts?: number;
  failed?: number;
}> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10); // le moteur cale sur le lundi

  const summary = await regenerateAllPlanningProposals(admin, {
    startDate: today,
    generatedBy: `manual:${profile.id}`,
    scheduleRecurrence: "weekly",
  });

  revalidatePath("/planning/employees");
  return {
    ok: true,
    total: summary.total,
    okCount: summary.ok,
    alerts: summary.alerts.length,
    failed: summary.failed.length,
  };
}
