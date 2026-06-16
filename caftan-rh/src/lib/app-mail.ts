// Karim 2026-06-16 : point d'entree UNIQUE pour tous les envois applicatifs.
// Wrapper mince autour de sendMailWithAttachments (Gmail SMTP -> Resend ->
// EmailJS, logging outbound_mails systematique, branding centralise).
// Toujours importer sendAppMail ici, jamais sendMailWithAttachments en direct.

import "server-only";
import {
  sendMailWithAttachments,
  type SendMailOptions,
  type SendMailResult,
} from "@/lib/mail-with-attachments";

export type { SendMailOptions, SendMailResult };

export async function sendAppMail(
  opts: SendMailOptions,
): Promise<SendMailResult> {
  return sendMailWithAttachments({
    replyTo: "hr@caftanfactory.com",
    ...opts,
  });
}
