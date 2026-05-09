// Audit log for every AI call (success OR failure). Powers /admin/ai-audit.
// Uses the service-role client so it works from cron / server actions / webhooks
// without an authenticated session.

import { createAdminClient } from "@/lib/supabase/server";
import type { AgentTask } from "./agent";

export type AuditEntry = {
  task: AgentTask;
  called_by?: string | null;
  application_id?: string | null;
  candidate_id?: string | null;
  employee_id?: string | null;
  model?: string | null;
  duration_ms?: number;
  success: boolean;
  error?: string | null;
  cost_usd?: number;
  cached?: boolean;
};

export async function logAudit(entry: AuditEntry): Promise<{ id: string | null }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_audit")
      .insert({
        task: entry.task,
        called_by: entry.called_by ?? null,
        application_id: entry.application_id ?? null,
        candidate_id: entry.candidate_id ?? null,
        employee_id: entry.employee_id ?? null,
        model: entry.model ?? null,
        duration_ms: entry.duration_ms ?? null,
        success: entry.success,
        error: entry.error ?? null,
        cost_usd: entry.cost_usd ?? 0,
        cached: entry.cached ?? false,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[ai_audit] insert failed:", error.message);
      return { id: null };
    }
    return { id: data?.id ?? null };
  } catch (e) {
    console.warn("[ai_audit] unexpected error:", (e as Error).message);
    return { id: null };
  }
}
