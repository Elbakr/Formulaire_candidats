"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { commitSitePlanAction, type SitePlanPreview } from "@/app/planning/sites/[code]/actions";

export async function approveAutoDraftAction(
  draftId: string,
): Promise<{ ok?: boolean; error?: string; created?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("auto_plan_drafts")
    .select("id, status, drafts_json")
    .eq("id", draftId)
    .maybeSingle();
  if (!row) return { error: "Draft introuvable." };
  const r = row as { id: string; status: string; drafts_json: unknown };
  if (r.status !== "pending") {
    return { error: `Statut non valide (${r.status}).` };
  }
  const drafts = (r.drafts_json ?? []) as SitePlanPreview["drafts"];
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { error: "Aucun shift à créer dans ce draft." };
  }
  const commit = await commitSitePlanAction(drafts);
  if (commit.error) return { error: commit.error };

  await supabase
    .from("auto_plan_drafts")
    .update({
      status: "approved",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  revalidatePath("/planning/auto-drafts");
  revalidatePath("/planning/calendar");
  return { ok: true, created: commit.created };
}

export async function rejectAutoDraftAction(
  draftId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_plan_drafts")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  if (error) return { error: error.message };
  revalidatePath("/planning/auto-drafts");
  return { ok: true };
}
