"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

type ActionResult = { ok: boolean; error?: string };

export async function resolveAnomalyAction(id: string, reason?: string | null): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: row, error: fErr } = await admin
    .from("anomaly_flags")
    .select("id, kind, target_type, target_id, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (fErr) return { ok: false, error: fErr.message };
  if (!row) return { ok: false, error: "Anomalie introuvable." };
  if ((row as { resolved_at: string | null }).resolved_at) {
    return { ok: false, error: "Anomalie déjà résolue." };
  }

  const { error } = await admin
    .from("anomaly_flags")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
      resolved_reason: reason ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const r = row as { kind: string; target_type: string; target_id: string | null };
  await logActivity({
    kind: "anomaly.resolved",
    targetType: r.target_type,
    targetId: r.target_id ?? null,
    actorId: profile.id,
    description: `Anomalie résolue : ${r.kind}${reason ? ` — ${reason}` : ""}`,
    data: { anomaly_id: id, kind: r.kind, reason: reason ?? null },
  });

  revalidatePath("/admin/anomalies");
  return { ok: true };
}

export async function resolveAnomalyFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const r = await resolveAnomalyAction(id, reason);
  if (!r.ok) {
    redirect(`/admin/anomalies?error=${encodeURIComponent(r.error ?? "")}`);
  }
  redirect("/admin/anomalies");
}
