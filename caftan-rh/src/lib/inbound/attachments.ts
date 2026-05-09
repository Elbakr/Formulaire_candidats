// Decode base64 attachments from a parsed inbound and upload them to the
// `inbound-attachments` bucket. Returns metadata used for the
// inbound_emails.attachments / messages.attachments columns.

import { createAdminClient } from "@/lib/supabase/server";
import type { ParsedAttachment } from "./parse";

export type StoredAttachment = {
  path: string;
  filename: string;
  mime_type: string;
  size: number;
};

const BUCKET = "inbound-attachments";

function safeFilename(input: string): string {
  const base = (input || "attachment.bin").trim();
  return base
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180) || "attachment.bin";
}

function decodeBase64(b64: string): Buffer {
  // Some providers prefix with "data:...;base64,"
  const cleaned = b64.replace(/^data:[^;]+;base64,/i, "");
  return Buffer.from(cleaned, "base64");
}

export async function uploadInboundAttachments(
  inboundEmailId: string,
  attachments: ParsedAttachment[],
): Promise<StoredAttachment[]> {
  if (!attachments || attachments.length === 0) return [];
  const admin = createAdminClient();
  const stored: StoredAttachment[] = [];

  // Track filename collisions per email
  const seen = new Map<string, number>();

  for (const att of attachments) {
    try {
      const buf = decodeBase64(att.content_base64);
      let name = safeFilename(att.filename);
      const dup = seen.get(name) ?? 0;
      if (dup > 0) {
        const dot = name.lastIndexOf(".");
        if (dot > 0) name = `${name.slice(0, dot)}-${dup}${name.slice(dot)}`;
        else name = `${name}-${dup}`;
      }
      seen.set(safeFilename(att.filename), dup + 1);

      const path = `${inboundEmailId}/${name}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
        contentType: att.content_type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        console.warn("[inbound] attachment upload failed", path, error.message);
        continue;
      }
      stored.push({
        path,
        filename: name,
        mime_type: att.content_type || "application/octet-stream",
        size: typeof att.size === "number" ? att.size : buf.byteLength,
      });
    } catch (e) {
      console.warn("[inbound] attachment decode failed", att.filename, (e as Error).message);
    }
  }

  return stored;
}

/**
 * Generate a temporary signed URL for an attachment download (used in UI).
 */
export async function signInboundAttachment(path: string, expiresInSec = 600): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
