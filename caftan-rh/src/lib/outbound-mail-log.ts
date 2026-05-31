// Karim 2026-05-31 : helper centralisé pour archiver tous les mails sortants
// (contract_signature, info_request, payslip_share, etc.) dans la table
// outbound_mails. À appeler depuis chaque fonction d'envoi serveur.

import { createAdminClient } from "@/lib/supabase/server";

export type MailSource =
  | "contract_signature"
  | "contract_employer_archive"
  | "info_request"
  | "payslip_share"
  | "payslip_share_external"
  | "magic_link"
  | "screening_request"
  | "tunnel_recap"
  | "password_reset"
  | "manual";

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

export const SOURCE_LABELS: Record<MailSource, string> = {
  contract_signature: "Contrat à signer",
  contract_employer_archive: "Archive employeur contrat",
  info_request: "Demande d'infos manquantes",
  payslip_share: "Fiche de paie envoyée",
  payslip_share_external: "Fiche de paie partagée (externe)",
  magic_link: "Lien de connexion auto",
  screening_request: "Invitation questionnaire",
  tunnel_recap: "Récap tunnel test",
  password_reset: "Réinitialisation mot de passe",
  manual: "Mail manuel",
};

export const SOURCE_COLORS: Record<MailSource, string> = {
  contract_signature: "bg-purple-100 text-purple-800",
  contract_employer_archive: "bg-purple-50 text-purple-700",
  info_request: "bg-amber-100 text-amber-800",
  payslip_share: "bg-green-100 text-green-800",
  payslip_share_external: "bg-emerald-100 text-emerald-800",
  magic_link: "bg-blue-100 text-blue-800",
  screening_request: "bg-pink-100 text-pink-800",
  tunnel_recap: "bg-gray-100 text-gray-700",
  password_reset: "bg-rose-100 text-rose-800",
  manual: "bg-gray-100 text-gray-800",
};
