"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAppMail } from "@/lib/app-mail";

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
  await requireRole(["admin", "rh"]);

  let fullBody = args.body;
  if (args.attachments.length > 0) {
    fullBody += "\n\n═══════ PIÈCES JOINTES ═══════\n";
    for (const a of args.attachments) {
      fullBody += `\n📎 ${a.name} : ${a.url}`;
    }
  }

  const result = await sendAppMail({
    to: args.recipient_email,
    toName: args.recipient_name ?? undefined,
    subject: args.subject,
    body: fullBody,
    source: "manual_rh",
    employeeId: args.employee_id ?? undefined,
    attachmentUrls: args.attachments.map((a) => ({ name: a.name, url: a.url })),
  });

  if (!result.ok) return { ok: false, error: result.error ?? "Envoi mail échoué" };
  return { ok: true };
}
