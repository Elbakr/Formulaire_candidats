// Karim 2026-05-31 : helper SERVER-ONLY pour journaliser les
// partages + vues de documents dans document_audit_log.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type DocAuditAction =
  | "share_email"
  | "share_link"
  | "view"
  | "download"
  | "screenshot";

export type DocAuditType =
  | "payslip"
  | "contract"
  | "cv"
  | "screening_pdf"
  | "misc";

export interface DocAuditEntry {
  employee_id: string | null;
  candidate_id?: string | null;
  doc_type: DocAuditType;
  doc_ref: string;
  doc_label?: string;
  action: DocAuditAction;
  channel?: string;
  actor_profile_id?: string | null;
  actor_name?: string | null;
  recipient_email?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  signed_url_path?: string | null;
  notes?: string | null;
  outbound_mail_id?: string | null;
}

/**
 * Best-effort : si insert échoue, log warn et continue.
 */
export async function logDocAudit(entry: DocAuditEntry): Promise<{ id?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("document_audit_log")
      .insert({
        employee_id: entry.employee_id,
        candidate_id: entry.candidate_id ?? null,
        doc_type: entry.doc_type,
        doc_ref: entry.doc_ref,
        doc_label: entry.doc_label ?? null,
        action: entry.action,
        channel: entry.channel ?? null,
        actor_profile_id: entry.actor_profile_id ?? null,
        actor_name: entry.actor_name ?? null,
        recipient_email: entry.recipient_email ?? null,
        ip_address: entry.ip_address ?? null,
        user_agent: entry.user_agent ?? null,
        signed_url_path: entry.signed_url_path ?? null,
        notes: entry.notes ?? null,
        outbound_mail_id: entry.outbound_mail_id ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[logDocAudit] insert error:", error.message);
      return {};
    }
    return { id: data?.id };
  } catch (e) {
    console.warn("[logDocAudit] unexpected:", (e as Error).message);
    return {};
  }
}
