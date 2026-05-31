"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logOutboundMail } from "@/lib/outbound-mail-log";

export async function uploadMailAttachmentAction(
  formData: FormData,
): Promise<{ ok: true; url: string; storage_path: string } | { ok: false; error: string }> {
  await requireRole(["admin", "rh"]);
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Fichier manquant" };
  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}_${safeName}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from("mail-attachments").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  // URL signée 30 jours pour l'attachment dans le mail
  const { data: signed } = await admin.storage.from("mail-attachments").createSignedUrl(path, 30 * 24 * 3600);
  if (!signed?.signedUrl) return { ok: false, error: "URL signée KO" };
  return { ok: true, url: signed.signedUrl, storage_path: path };
}

interface SendManualArgs {
  recipient_email: string;
  recipient_name: string | null;
  employee_id: string | null;
  subject: string;
  body: string;
  attachments: Array<{ name: string; url: string; size?: number; storage_path?: string }>;
}

export async function sendManualMailAction(args: SendManualArgs): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);

  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { ok: false, error: "EmailJS non configuré" };

  let fullBody = args.body;
  if (args.attachments.length > 0) {
    fullBody += "\n\n═══════ PIÈCES JOINTES ═══════\n";
    for (const a of args.attachments) {
      fullBody += `\n📎 ${a.name} : ${a.url}`;
    }
  }

  const params = {
    to_email: args.recipient_email, email: args.recipient_email, user_email: args.recipient_email,
    candidate_email: args.recipient_email,
    to: args.recipient_email, to_name: args.recipient_name ?? args.recipient_email,
    name: args.recipient_name ?? "", candidate_name: args.recipient_name ?? "",
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: args.subject,
    message: fullBody, html_message: fullBody.replace(/\n/g, "<br>"),
    body: fullBody, html: fullBody.replace(/\n/g, "<br>"), content: fullBody,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  const sent = res.ok;
  await logOutboundMail({
    recipient_email: args.recipient_email,
    recipient_name: args.recipient_name,
    employee_id: args.employee_id,
    sender_profile_id: profile.id,
    sender_name: profile.full_name ?? "Caftan Factory (By AMD Megastore)",
    subject: args.subject,
    body: args.body,
    source: "manual",
    attachments: args.attachments,
    status: sent ? "sent" : "failed",
    error_message: sent ? undefined : `EmailJS HTTP ${res.status}`,
  });

  if (!sent) return { ok: false, error: `EmailJS HTTP ${res.status}` };
  return { ok: true };
}
