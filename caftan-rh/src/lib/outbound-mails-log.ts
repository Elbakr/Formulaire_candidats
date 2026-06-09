// Karim 2026-06-07 : helper pour journaliser les mails sortants dans la
// table public.outbound_mails (cree par migration 20260620000720).
//
// Note : volontairement PAS marque `server-only` pour permettre l'import
// statique depuis emailjs-client.ts qui peut etre execute cote client.
// Cote client, getServiceClient() retourne null silencieusement
// (SUPABASE_SERVICE_ROLE_KEY est privee, jamais bundlee), donc le helper
// est un no-op effectif. Aucune fuite de cle.
//
// Best-effort : ne fait JAMAIS echouer un envoi, capture toute erreur en
// console.warn. Utilise la cle service role pour bypass RLS.
//
// Convention `source` : libelle court qui identifie le contexte d'envoi.
// Exemples : "application-ack", "interview-invite", "magic-link",
// "signature-contract", "payslip-monthly", "termination-doc",
// "expense-confirmation", "info-request". Sert au filtre dans /rh/mails.
//
// Convention `sourceRef` : ID de l'entite source (candidate_id, contract_id,
// payslip_id, expense_id...). Permet de back-link depuis la UI du journal.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type OutboundMailProvider =
  | "resend"
  | "smtp_gmail"
  | "emailjs"
  | "none"
  | "unknown";

export interface OutboundMailAttachmentMeta {
  filename: string;
  size?: number;
  contentType?: string;
}

export interface OutboundMailLogInput {
  to: string | string[];
  recipientName?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachments?: OutboundMailAttachmentMeta[];
  source: string;
  sourceRef?: string | null;
  deliveryProvider: OutboundMailProvider;
  status?: "sent" | "failed";
  errorMessage?: string | null;
  employeeId?: string | null;
  candidateId?: string | null;
  senderProfileId?: string | null;
  fromEmail?: string;
  senderName?: string;
}

let _client: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/**
 * Journalise un mail sortant. Insertion silencieuse (try/catch interne).
 * Ne JAMAIS attendre cette fonction avec un .then qui bloque l'envoi.
 *
 * Si `to` est un array, une ligne est creee par destinataire.
 */
export async function logOutboundMail(input: OutboundMailLogInput): Promise<void> {
  try {
    const sb = getServiceClient();
    if (!sb) return;

    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const rows = recipients
      .filter((r) => typeof r === "string" && r.trim().length > 0)
      .map((r) => {
        const row: Record<string, unknown> = {
          recipient_email: r.trim().toLowerCase(),
          subject: input.subject,
          body: input.bodyText ?? null,
          body_html: input.bodyHtml ?? null,
          attachments: input.attachments ?? [],
          source: input.source,
          source_ref: input.sourceRef ?? null,
          status: input.status ?? "sent",
          delivery_provider: input.deliveryProvider,
          error_message: input.errorMessage ?? null,
          employee_id: input.employeeId ?? null,
          candidate_id: input.candidateId ?? null,
          sender_profile_id: input.senderProfileId ?? null,
        };
        if (input.recipientName) row.recipient_name = input.recipientName;
        if (input.fromEmail) row.from_email = input.fromEmail;
        if (input.senderName) row.sender_name = input.senderName;
        return row;
      });

    if (rows.length === 0) return;
    const { error } = await sb.from("outbound_mails").insert(rows);
    if (error) {
      console.warn("[outbound-mails-log] insert error:", error.message);
    }
  } catch (e) {
    console.warn("[outbound-mails-log] exception (silenced):", (e as Error).message);
  }
}

