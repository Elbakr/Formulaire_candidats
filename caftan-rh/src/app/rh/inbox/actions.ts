"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

type ActionResult = { ok: boolean; error?: string };

/**
 * Approve and execute an action.
 *
 * Behaviour by kind :
 *   - reply_draft : marks status='approved'. The actual sending happens client-side via
 *     EmailJS (existing flow) — we don't try to send here. The drafter chooses a draft
 *     by index and we surface it via payload.selected_draft.
 *   - status_change : applies applications.status update.
 *   - send_template : marks approved (the actual send happens client-side).
 *   - assign_manager : updates applications.assigned_manager.
 *   - generic : marks status='executed' with no side effect.
 *
 * Always logs to activity_log when applicable.
 */
export async function approveActionAction(
  actionId: string,
  options?: { selected_draft_index?: number },
): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("id", actionId)
    .single();

  if (fetchErr || !row) {
    return { ok: false, error: "Action introuvable." };
  }
  if (row.status !== "proposed") {
    return { ok: false, error: `Action déjà ${row.status}.` };
  }

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  let executed = false;
  let appliedNote: string | null = null;

  try {
    switch (row.kind) {
      case "status_change": {
        const targetType = row.target_type;
        const targetId = row.target_id;
        const next = payload.next_status as string | undefined;
        if (targetType === "application" && targetId && next) {
          const { error } = await admin
            .from("applications")
            .update({ status: next })
            .eq("id", targetId);
          if (error) throw error;
          executed = true;
          appliedNote = `Statut → ${next}`;
        }
        break;
      }
      case "assign_manager": {
        const targetId = row.target_id;
        const managerId = payload.manager_id as string | undefined;
        if (row.target_type === "application" && targetId && managerId) {
          const { error } = await admin
            .from("applications")
            .update({ assigned_manager: managerId })
            .eq("id", targetId);
          if (error) throw error;
          executed = true;
          appliedNote = `Manager → ${managerId}`;
        }
        break;
      }
      case "spam_archive": {
        // Mark inbound_email as spam if referenced
        const inboundId = payload.inbound_email_id as string | undefined;
        if (inboundId) {
          await admin.from("inbound_emails").update({ status: "spam" }).eq("id", inboundId);
        }
        executed = true;
        appliedNote = "Email marqué spam";
        break;
      }
      // For reply_draft / send_template / doc_classify / candidate_scoring / follow_up :
      // we do not auto-send / auto-classify here. The user clicks Approuver and the
      // browser-side flow handles the actual outgoing email. We persist the choice
      // (selected draft) so the composer can pre-fill if needed.
      default:
        executed = false;
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Erreur d'exécution." };
  }

  const updatePayload: Record<string, unknown> = {
    status: executed ? "executed" : "approved",
    decided_by: profile.id,
    decided_at: new Date().toISOString(),
  };
  if (executed) updatePayload.executed_at = new Date().toISOString();
  if (typeof options?.selected_draft_index === "number") {
    const next = { ...(payload as object), selected_draft_index: options.selected_draft_index };
    updatePayload.payload = next;
  }

  const { error: updErr } = await admin
    .from("agent_actions")
    .update(updatePayload)
    .eq("id", actionId);
  if (updErr) return { ok: false, error: updErr.message };

  await logActivity({
    kind: "ai.action.approved",
    targetType: (row.target_type as string) ?? null,
    targetId: row.target_id ?? null,
    actorId: profile.id,
    description: `Action IA approuvée : ${row.kind}${appliedNote ? ` — ${appliedNote}` : ""}`,
    data: { agent_action_id: actionId, kind: row.kind, executed },
  });

  revalidatePath("/rh/inbox");
  revalidatePath(`/rh/inbox/${actionId}`);
  return { ok: true };
}

export async function rejectActionAction(actionId: string, reason?: string | null): Promise<ActionResult> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();

  const { data: row, error: fetchErr } = await admin
    .from("agent_actions")
    .select("kind, target_type, target_id, status")
    .eq("id", actionId)
    .single();

  if (fetchErr || !row) return { ok: false, error: "Action introuvable." };
  if (row.status !== "proposed") return { ok: false, error: `Action déjà ${row.status}.` };

  const { error } = await admin
    .from("agent_actions")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_reason: reason ?? null,
    })
    .eq("id", actionId);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    kind: "ai.action.rejected",
    targetType: (row.target_type as string) ?? null,
    targetId: row.target_id ?? null,
    actorId: profile.id,
    description: `Action IA rejetée : ${row.kind}${reason ? ` — ${reason}` : ""}`,
    data: { agent_action_id: actionId, kind: row.kind, reason: reason ?? null },
  });

  revalidatePath("/rh/inbox");
  revalidatePath(`/rh/inbox/${actionId}`);
  return { ok: true };
}

export async function approveAndRedirectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const idxRaw = formData.get("draft_index");
  const idx = typeof idxRaw === "string" && idxRaw !== "" ? parseInt(idxRaw, 10) : undefined;
  const r = await approveActionAction(id, typeof idx === "number" && !Number.isNaN(idx) ? { selected_draft_index: idx } : undefined);
  if (!r.ok) {
    redirect(`/rh/inbox/${id}?error=${encodeURIComponent(r.error ?? "")}`);
  }
  redirect("/rh/inbox");
}

export async function rejectAndRedirectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const r = await rejectActionAction(id, reason);
  if (!r.ok) {
    redirect(`/rh/inbox/${id}?error=${encodeURIComponent(r.error ?? "")}`);
  }
  redirect("/rh/inbox");
}

/**
 * Cron helper : passe les actions proposed dont expires_at est dépassé en status='expired'.
 * Idempotent.
 */
export async function expireOldActions(): Promise<{ count: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_actions")
    .update({ status: "expired" })
    .eq("status", "proposed")
    .lte("expires_at", new Date().toISOString())
    .select("id");
  if (error) {
    console.warn("[expireOldActions]", error.message);
    return { count: 0 };
  }
  return { count: data?.length ?? 0 };
}
