// Karim 2026-05-31 : helper centralisé SERVER-ONLY pour archiver les mails
// sortants. Les constantes UI (SOURCE_LABELS/COLORS) sont dans
// outbound-mail-types.ts (importable depuis client components sans embarquer
// supabase/server qui dépend de next/headers).

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { MailSource } from "./outbound-mail-types";
export type { MailSource } from "./outbound-mail-types";
export { SOURCE_LABELS, SOURCE_COLORS } from "./outbound-mail-types";

export interface OutboundMailLog {
  recipient_email: string;
  recipient_name?: string | null;
  subject: string;
  body?: string | null;
  body_html?: string | null;
  source: MailSource;
  source_ref?: string | null;
  employee_id?: string | null;
  candidate_id?: string | null;
  sender_profile_id?: string | null;
  sender_name?: string;
  from_email?: string;
  attachments?: Array<{ name: string; url: string; size?: number }>;
  status?: "sent" | "failed" | "opened" | "replied";
  error_message?: string;
  delivery_provider?: "emailjs" | "supabase" | "manual";
  email_thread_id?: string | null;
}

/**
 * Archive un mail sortant en BD. Best-effort : si l'insert échoue, log et
 * continue (ne fait pas échouer l envoi du mail réel).
 */
export async function logOutboundMail(mail: OutboundMailLog): Promise<{ id?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("outbound_mails")
      .insert({
        recipient_email: mail.recipient_email,
        recipient_name: mail.recipient_name ?? null,
        subject: mail.subject,
        body: mail.body ?? null,
        body_html: mail.body_html ?? mail.body?.replace(/\n/g, "<br>") ?? null,
        source: mail.source,
        source_ref: mail.source_ref ?? null,
        employee_id: mail.employee_id ?? null,
        candidate_id: mail.candidate_id ?? null,
        sender_profile_id: mail.sender_profile_id ?? null,
        sender_name: mail.sender_name ?? "Caftan Factory (By AMD Megastore)",
        from_email: mail.from_email ?? "hr@caftanfactory.com",
        attachments: mail.attachments ?? [],
        status: mail.status ?? "sent",
        error_message: mail.error_message ?? null,
        delivery_provider: mail.delivery_provider ?? "emailjs",
        email_thread_id: mail.email_thread_id ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[logOutboundMail] insert error:", error.message);
      return {};
    }
    return { id: data?.id };
  } catch (e) {
    console.warn("[logOutboundMail] unexpected error:", (e as Error).message);
    return {};
  }
}

