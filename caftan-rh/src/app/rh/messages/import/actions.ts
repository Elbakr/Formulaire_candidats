"use server";

import { revalidatePath } from "next/cache";
import { simpleParser } from "mailparser";
import { requireRole } from "@/lib/auth";
import { parseInbound, type ParsedAttachment } from "@/lib/inbound/parse";
import { processInbound } from "@/lib/inbound/process";

type Result = {
  ok?: boolean;
  error?: string;
  inbound_email_id?: string;
  matched_application_id?: string | null;
  matched_via?: string | null;
};

export async function importEmailAction(formData: FormData): Promise<Result> {
  await requireRole(["admin", "rh", "manager"]);

  const mode = String(formData.get("mode") ?? "manual");

  try {
    let parsed;

    if (mode === "raw") {
      const raw = String(formData.get("raw") ?? "").trim();
      if (!raw) return { error: "Colle le contenu brut .eml dans la zone de texte." };

      // mailparser accepte string ou Buffer ; les en-têtes peuvent être avec \r\n ou \n.
      const mp = await simpleParser(raw);
      const fromObj = mp.from?.value?.[0];
      const toObj =
        mp.to && !Array.isArray(mp.to)
          ? mp.to.value?.[0]
          : Array.isArray(mp.to)
            ? mp.to[0]?.value?.[0]
            : undefined;
      const refs = Array.isArray(mp.references)
        ? mp.references.join(" ")
        : (mp.references ?? null);

      const attachments: ParsedAttachment[] = (mp.attachments ?? [])
        .map((a) => ({
          filename: a.filename ?? "attachment.bin",
          content_type: a.contentType ?? "application/octet-stream",
          content_base64:
            a.content && Buffer.isBuffer(a.content) ? a.content.toString("base64") : "",
          size: a.size,
        }))
        .filter((a) => a.content_base64.length > 0);

      const headersObj: Record<string, unknown> = {};
      try {
        mp.headers?.forEach((value, key) => { headersObj[key] = value; });
      } catch { /* ignore */ }

      parsed = parseInbound({
        from: fromObj
          ? { email: fromObj.address ?? "", name: fromObj.name ?? null }
          : null,
        to: toObj ? { email: toObj.address ?? "" } : null,
        subject: mp.subject ?? null,
        text: mp.text ?? null,
        html: mp.html === false ? null : mp.html ?? null,
        message_id: mp.messageId ?? null,
        in_reply_to: mp.inReplyTo ?? null,
        references: refs,
        headers: headersObj,
        attachments,
      });
    } else {
      // Manual mode
      const fromEmail = String(formData.get("from_email") ?? "").trim().toLowerCase();
      const fromName = String(formData.get("from_name") ?? "").trim() || null;
      const subject = String(formData.get("subject") ?? "").trim() || null;
      const bodyText = String(formData.get("body_text") ?? "");

      if (!fromEmail) return { error: "Email du candidat requis." };
      if (!bodyText.trim()) return { error: "Corps de l'email requis." };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
        return { error: "Email invalide." };
      }

      parsed = parseInbound({
        from: { email: fromEmail, name: fromName },
        subject,
        text: bodyText,
        message_id: `<manual-${Date.now()}-${Math.random().toString(36).slice(2)}@caftan-rh.local>`,
        attachments: [],
      });
    }

    const result = await processInbound(parsed);

    revalidatePath("/rh/messages");
    revalidatePath("/rh/messages/unmatched");
    return {
      ok: true,
      inbound_email_id: result.inbound_email_id,
      matched_application_id: result.match.application_id ?? null,
      matched_via: result.match.via ?? null,
    };
  } catch (e) {
    console.error("[importEmailAction]", e);
    return { error: (e as Error).message };
  }
}
