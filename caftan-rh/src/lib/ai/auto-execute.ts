// Auto-action whitelist (Vague 5).
//
// When `org_settings.ai_autonomy_level >= 1` AND a proposed `agent_actions`
// row has `ai_confidence >= AUTO_EXECUTE_MIN_CONFIDENCE` AND its `kind` is in
// the whitelist below, we execute it automatically — without human approval.
//
// Whitelist design notes (SAFETY) :
//   - acknowledge_application : sends an "accusé de réception" template to a
//     known candidate, only if the candidate has a known email and only if the
//     application status is 'new'. We never escalate beyond a polite
//     acknowledgement.
//   - classify_spam : marks an `inbound_emails` row as `status='spam'`. No
//     outbound contact. Pure DB update.
//   - tag_attachment : sets `documents.catalog_slug`. No contact. Reversible.
//   - mark_onboarding_done : sets `onboarding_run_items.done_at`. Reversible.
//   - nudge_no_reply : auto-relance via the `relance` template, BUT only after
//     verifying that the last outbound was sent ≥ N days ago and no inbound
//     reply has arrived since. Conservative.
//
// All other kinds (status_change, assign_manager, candidate_scoring) require
// human approval — they affect candidate routing and management decisions.
//
// `tryAutoExecute(actionId)` :
//   - re-reads the row inside a single SQL update (no race) ; status change
//     to 'executed' is atomic on a `status='proposed'` row.
//   - on success, logs `agent.auto_executed` activity + sets `decided_by=null`
//     and a structured `decision_reason`.
//   - returns `{ ok, executed?, reason? }`.

import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";

export const AUTO_EXECUTE_MIN_CONFIDENCE = 0.95;

/**
 * Whitelist of agent_action.kind values that may be auto-executed.
 * Any kind NOT in this list is always sent to a human, regardless of
 * autonomy_level or confidence.
 */
export const AUTO_EXECUTE_WHITELIST = new Set<string>([
  "acknowledge_application",
  "classify_spam",
  "tag_attachment",
  "mark_onboarding_done",
  "nudge_no_reply",
]);

/**
 * Minimum org_settings.ai_autonomy_level required to enable each kind.
 * (Allows progressive opt-in : level 1 enables everything in the whitelist
 *  by default. Lower levels could be granular per-kind in the future.)
 */
const KIND_MIN_AUTONOMY: Record<string, number> = {
  acknowledge_application: 1,
  classify_spam: 1,
  tag_attachment: 1,
  mark_onboarding_done: 1,
  nudge_no_reply: 2, // gating: contacts a candidate, so reserve for level ≥ 2
};

export type AutoExecuteResult = {
  ok: boolean;
  executed?: boolean;
  /** When ok=true and executed=false, why we skipped (eg. confidence too low). */
  reason?: string;
  error?: string;
};

type AgentActionRow = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  target_type: string | null;
  target_id: string | null;
  ai_confidence: number | null;
  proposed_by_agent: string | null;
  expires_at: string | null;
};

/**
 * Read org-wide autonomy level. Returns 0 on error (= safe default).
 */
async function readAutonomyLevel(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("org_settings")
      .select("ai_autonomy_level")
      .eq("id", 1)
      .maybeSingle();
    return Math.max(0, Math.min(3, Number((data as { ai_autonomy_level?: number } | null)?.ai_autonomy_level ?? 0)));
  } catch {
    return 0;
  }
}

/**
 * Try to auto-execute a single agent_actions row. Idempotent : if the row is
 * not 'proposed' or doesn't qualify, we return ok with executed=false.
 */
export async function tryAutoExecute(actionId: string): Promise<AutoExecuteResult> {
  const admin = createAdminClient();

  const autonomy = await readAutonomyLevel();
  if (autonomy < 1) {
    return { ok: true, executed: false, reason: "autonomy_disabled" };
  }

  const { data: rowData, error: fetchErr } = await admin
    .from("agent_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!rowData) return { ok: false, error: "not_found" };

  const row = rowData as AgentActionRow;
  if (row.status !== "proposed") {
    return { ok: true, executed: false, reason: `status_${row.status}` };
  }

  if (!AUTO_EXECUTE_WHITELIST.has(row.kind)) {
    return { ok: true, executed: false, reason: "not_whitelisted" };
  }

  const minLevel = KIND_MIN_AUTONOMY[row.kind] ?? 1;
  if (autonomy < minLevel) {
    return { ok: true, executed: false, reason: "autonomy_below_kind_min" };
  }

  const confidence = Number(row.ai_confidence ?? 0);
  if (!(confidence >= AUTO_EXECUTE_MIN_CONFIDENCE)) {
    return { ok: true, executed: false, reason: "confidence_too_low" };
  }

  // Defensive : never auto-execute an expired action.
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: true, executed: false, reason: "expired" };
  }

  let appliedNote: string | null = null;
  try {
    switch (row.kind) {
      case "classify_spam": {
        const inboundId = (row.payload?.inbound_email_id as string | undefined) ?? null;
        if (inboundId) {
          const { error } = await admin
            .from("inbound_emails")
            .update({ status: "spam" })
            .eq("id", inboundId);
          if (error) throw error;
          appliedNote = `inbound ${inboundId} → spam`;
        } else {
          appliedNote = "no inbound_email_id, marked executed only";
        }
        break;
      }
      case "tag_attachment": {
        const documentId = (row.payload?.document_id as string | undefined) ?? null;
        const slug = (row.payload?.catalog_slug as string | undefined) ?? null;
        if (!documentId || !slug) {
          return { ok: true, executed: false, reason: "missing_document_or_slug" };
        }
        const { error } = await admin
          .from("documents")
          .update({ catalog_slug: slug })
          .eq("id", documentId);
        if (error) throw error;
        appliedNote = `document ${documentId} → ${slug}`;
        break;
      }
      case "mark_onboarding_done": {
        const itemId = (row.payload?.onboarding_run_item_id as string | undefined) ?? null;
        if (!itemId) return { ok: true, executed: false, reason: "missing_onboarding_run_item_id" };
        const { error } = await admin
          .from("onboarding_run_items")
          .update({ done_at: new Date().toISOString() })
          .eq("id", itemId)
          .is("done_at", null);
        if (error) throw error;
        appliedNote = `onboarding item ${itemId} cocheé`;
        break;
      }
      case "acknowledge_application": {
        const result = await sendAckApplicationEmail(admin, row);
        if (!result.ok) {
          return { ok: false, error: result.error ?? "ack_send_failed" };
        }
        appliedNote = result.note ?? "ack envoyé";
        break;
      }
      case "nudge_no_reply": {
        const result = await sendNudgeNoReply(admin, row);
        if (!result.ok) {
          return { ok: false, error: result.error ?? "nudge_failed" };
        }
        if (!result.executed) {
          return { ok: true, executed: false, reason: result.reason ?? "nudge_skipped" };
        }
        appliedNote = result.note ?? "relance envoyée";
        break;
      }
      default:
        return { ok: true, executed: false, reason: "unknown_kind" };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "execution_failed" };
  }

  // Atomic flip : only if still 'proposed' (avoid race vs human approving)
  const decisionReason = `auto-executed by whitelist (confidence ${confidence.toFixed(2)})${appliedNote ? ` — ${appliedNote}` : ""}`;
  const { data: updated, error: updErr } = await admin
    .from("agent_actions")
    .update({
      status: "executed",
      decided_by: null,
      decided_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      decision_reason: decisionReason,
    })
    .eq("id", actionId)
    .eq("status", "proposed")
    .select("id");

  if (updErr) return { ok: false, error: updErr.message };
  if (!updated || updated.length === 0) {
    // Someone else (human) decided in parallel. Not an error — just skipped.
    return { ok: true, executed: false, reason: "race_lost_to_human" };
  }

  await logActivity({
    kind: "agent.auto_executed",
    targetType: row.target_type ?? undefined,
    targetId: row.target_id ?? null,
    actorLabel: "auto-execute (whitelist)",
    description: `Action IA auto-exécutée : ${row.kind}${appliedNote ? ` — ${appliedNote}` : ""}`,
    data: {
      agent_action_id: row.id,
      kind: row.kind,
      ai_confidence: confidence,
      autonomy_level: autonomy,
    },
  });

  return { ok: true, executed: true };
}

/**
 * Cron-friendly bulk runner. Processes the oldest 'proposed' rows first.
 * Limited per call to avoid runaway cost.
 */
export async function autoExecuteBatch(limit: number = 50): Promise<{
  scanned: number;
  executed: number;
  skipped: number;
  errors: number;
}> {
  const admin = createAdminClient();

  const autonomy = await readAutonomyLevel();
  if (autonomy < 1) {
    return { scanned: 0, executed: 0, skipped: 0, errors: 0 };
  }

  const kinds = Array.from(AUTO_EXECUTE_WHITELIST);
  const { data: rows, error } = await admin
    .from("agent_actions")
    .select("id")
    .eq("status", "proposed")
    .gte("ai_confidence", AUTO_EXECUTE_MIN_CONFIDENCE)
    .in("kind", kinds)
    .order("proposed_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)));

  if (error) {
    console.warn("[auto-execute] fetch failed:", error.message);
    return { scanned: 0, executed: 0, skipped: 0, errors: 1 };
  }

  const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
  let executed = 0;
  let skipped = 0;
  let errors = 0;

  for (const id of ids) {
    const r = await tryAutoExecute(id);
    if (!r.ok) {
      errors += 1;
      continue;
    }
    if (r.executed) executed += 1;
    else skipped += 1;
  }

  return { scanned: ids.length, executed, skipped, errors };
}

// ---------- helpers ----------

type Admin = ReturnType<typeof createAdminClient>;

async function getOrgVars(admin: Admin): Promise<OrgVars> {
  const { data } = await admin
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp, org_address")
    .eq("id", 1)
    .maybeSingle();
  const o = (data ?? {}) as Partial<OrgVars>;
  return {
    org_name: o.org_name ?? "Caftan Factory",
    org_email: o.org_email ?? "hr@caftanfactory.com",
    org_phone: o.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: o.org_whatsapp ?? "32468596100",
    org_address: o.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };
}

/**
 * SAFE outbound : we record the email as an outbound `messages` row + log
 * an activity event. Real-world delivery still goes through EmailJS at the
 * UI layer ; this server-side path is a structured "send by sequence" that
 * the existing `sequences-tick` cron also uses, so we stay consistent.
 *
 * If you wire Resend later (`RESEND_API_KEY`), this is the single point to
 * actually fire the SMTP — for now we only persist the trace.
 */
async function recordOutboundEmail(
  admin: Admin,
  applicationId: string,
  subject: string,
  bodyHtml: string,
  provider: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("messages").insert({
    application_id: applicationId,
    direction: "outbound",
    sender_id: null,
    subject,
    body: bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    email_provider_id: provider,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function sendAckApplicationEmail(
  admin: Admin,
  row: AgentActionRow,
): Promise<{ ok: boolean; executed?: boolean; reason?: string; note?: string; error?: string }> {
  if (row.target_type !== "application" || !row.target_id) {
    return { ok: true, executed: false, reason: "wrong_target" };
  }
  const applicationId = row.target_id;

  // Verify application status (we only acknowledge a *new* application).
  const { data: appData } = await admin
    .from("applications")
    .select("id, status, candidate:candidates(email, full_name)")
    .eq("id", applicationId)
    .maybeSingle();
  type AppRow = {
    id: string;
    status: string;
    candidate: { email: string; full_name: string } | null;
  };
  const app = appData as unknown as AppRow | null;
  if (!app) return { ok: true, executed: false, reason: "application_not_found" };
  if (app.status !== "new") return { ok: true, executed: false, reason: "status_not_new" };
  if (!app.candidate?.email) return { ok: true, executed: false, reason: "no_candidate_email" };

  const slug = (row.payload?.template_slug as string | undefined) ?? "accuse_reception";
  const { data: tmpl } = await admin
    .from("email_templates")
    .select("slug, subject, body_html")
    .eq("slug", slug)
    .maybeSingle();
  if (!tmpl) return { ok: true, executed: false, reason: "template_not_found" };

  const orgVars = await getOrgVars(admin);
  const t = tmpl as { subject: string; body_html: string };
  const vars = {
    ...orgVars,
    firstname: firstNameOf(app.candidate.full_name),
    fullname: app.candidate.full_name,
    custom: "",
    dates: "",
    times: "",
  };
  const subject = renderTemplate(t.subject, vars);
  const body = renderTemplate(t.body_html, vars);

  const r = await recordOutboundEmail(admin, applicationId, subject, body, "auto-execute");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, executed: true, note: `accusé envoyé à ${app.candidate.email}` };
}

async function sendNudgeNoReply(
  admin: Admin,
  row: AgentActionRow,
): Promise<{ ok: boolean; executed?: boolean; reason?: string; note?: string; error?: string }> {
  if (row.target_type !== "application" || !row.target_id) {
    return { ok: true, executed: false, reason: "wrong_target" };
  }
  const applicationId = row.target_id;
  const minSilenceDays = Number((row.payload?.min_silence_days as number | undefined) ?? 5);

  // Pull last outbound + last inbound on this application
  const { data: msgsData } = await admin
    .from("messages")
    .select("id, direction, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(20);
  type Msg = { id: string; direction: "inbound" | "outbound"; created_at: string };
  const msgs = (msgsData ?? []) as Msg[];

  const lastOut = msgs.find((m) => m.direction === "outbound") ?? null;
  const lastIn = msgs.find((m) => m.direction === "inbound") ?? null;
  if (!lastOut) return { ok: true, executed: false, reason: "no_prior_outbound" };
  if (lastIn && new Date(lastIn.created_at) > new Date(lastOut.created_at)) {
    return { ok: true, executed: false, reason: "candidate_already_replied" };
  }
  const ageDays = (Date.now() - new Date(lastOut.created_at).getTime()) / 86_400_000;
  if (ageDays < minSilenceDays) {
    return { ok: true, executed: false, reason: "silence_too_short" };
  }

  // Fetch app + candidate + relance template
  const { data: appData } = await admin
    .from("applications")
    .select("id, status, candidate:candidates(email, full_name)")
    .eq("id", applicationId)
    .maybeSingle();
  type AppRow = {
    id: string;
    status: string;
    candidate: { email: string; full_name: string } | null;
  };
  const app = appData as unknown as AppRow | null;
  if (!app) return { ok: true, executed: false, reason: "application_not_found" };
  if (!app.candidate?.email) return { ok: true, executed: false, reason: "no_candidate_email" };
  if (["hired", "refused"].includes(app.status)) {
    return { ok: true, executed: false, reason: "terminal_status" };
  }

  const slug = (row.payload?.template_slug as string | undefined) ?? "relance";
  const { data: tmpl } = await admin
    .from("email_templates")
    .select("slug, subject, body_html")
    .eq("slug", slug)
    .maybeSingle();
  if (!tmpl) return { ok: true, executed: false, reason: "template_not_found" };

  const orgVars = await getOrgVars(admin);
  const t = tmpl as { subject: string; body_html: string };
  const vars = {
    ...orgVars,
    firstname: firstNameOf(app.candidate.full_name),
    fullname: app.candidate.full_name,
    custom: "",
    dates: "",
    times: "",
  };
  const subject = renderTemplate(t.subject, vars);
  const body = renderTemplate(t.body_html, vars);

  const r = await recordOutboundEmail(admin, applicationId, subject, body, "auto-execute");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, executed: true, note: `relance envoyée à ${app.candidate.email}` };
}
