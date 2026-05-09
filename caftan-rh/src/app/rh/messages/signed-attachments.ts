// Server-only helper : pre-sign URLs for inbound attachments referenced in a
// list of message rows, so the page renders with clickable download links.

import { signInboundAttachment } from "@/lib/inbound/attachments";

type Att = { path: string; filename: string; mime_type: string; size: number };
type MsgWithAtts = { id: string; attachments: Att[] | null };

export async function signedAttachmentsForMessages(
  messages: MsgWithAtts[],
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of messages) {
    if (!m.attachments || m.attachments.length === 0) continue;
    const sub: Record<string, string> = {};
    for (const a of m.attachments) {
      if (!a?.path) continue;
      const url = await signInboundAttachment(a.path, 600);
      if (url) sub[a.path] = url;
    }
    if (Object.keys(sub).length > 0) out[m.id] = sub;
  }
  return out;
}
