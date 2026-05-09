// Orchestrate inbound parsing + matching + storage + DB insert.
//
// Steps :
//  1. matchInbound() to find an application_id (cascade)
//  2. Insert inbound_emails row with parsed payload + match info (so we have an id)
//  3. Decode + upload attachments to `inbound-attachments/<id>/...`
//  4. Update inbound_emails.attachments with stored metadata
//  5. If matched : ensure email_threads row exists, insert messages row (direction=inbound)
//     and bump thread.last_message_at + message_count.

import { createAdminClient } from "@/lib/supabase/server";
import { matchInbound, type MatchResult } from "./matcher";
import { uploadInboundAttachments, type StoredAttachment } from "./attachments";
import { subjectRoot, type ParsedInbound } from "./parse";
import { logActivity } from "@/lib/activity";

export type ProcessResult = {
  ok: boolean;
  inbound_email_id: string;
  match: MatchResult;
  message_id?: string;
  thread_id?: string;
  attachments: StoredAttachment[];
};

export async function processInbound(parsed: ParsedInbound): Promise<ProcessResult> {
  const admin = createAdminClient();

  // 1. Match
  const match = await matchInbound({
    from_email: parsed.from_email,
    in_reply_to: parsed.in_reply_to,
    subject: parsed.subject,
    body_text: parsed.body_text ?? null,
  });

  const status = match.application_id ? "matched" : "unmatched";

  // 2. Insert inbound row (no attachments yet)
  const { data: row, error: insertErr } = await admin
    .from("inbound_emails")
    .insert({
      from_email: parsed.from_email,
      from_name: parsed.from_name,
      to_email: parsed.to_email,
      subject: parsed.subject,
      body_text: parsed.body_text,
      body_html: parsed.body_html,
      message_id: parsed.message_id,
      in_reply_to: parsed.in_reply_to,
      references_header: parsed.references_header,
      headers: parsed.headers,
      raw: parsed.raw,
      attachments: [],
      matched_application_id: match.application_id,
      matched_via: match.via,
      match_confidence: match.confidence,
      status,
    })
    .select("id")
    .single();

  if (insertErr || !row?.id) {
    throw new Error(`inbound_emails insert failed: ${insertErr?.message ?? "unknown"}`);
  }
  const inboundId = row.id as string;

  // 3. Upload attachments
  const stored = await uploadInboundAttachments(inboundId, parsed.attachments);

  // 4. Update with attachments + processed_at
  await admin
    .from("inbound_emails")
    .update({
      attachments: stored,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inboundId);

  let messageId: string | undefined;
  let threadId: string | undefined;

  // 5. If matched → write messages row + thread
  if (match.application_id) {
    const root = subjectRoot(parsed.subject);

    // Find or create thread
    let thread: { id: string } | null = null;
    if (root) {
      const { data: existing } = await admin
        .from("email_threads")
        .select("id")
        .eq("application_id", match.application_id)
        .ilike("subject_root", root)
        .limit(1)
        .maybeSingle();
      thread = existing as { id: string } | null;

      if (!thread) {
        const { data: created } = await admin
          .from("email_threads")
          .insert({
            application_id: match.application_id,
            subject_root: root,
            last_message_at: new Date().toISOString(),
            message_count: 0,
          })
          .select("id")
          .single();
        thread = created as { id: string } | null;
      }
    }
    threadId = thread?.id;

    // Insert messages row (inbound)
    const bodyForLog = (parsed.body_text || (parsed.body_html ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    const { data: msg } = await admin
      .from("messages")
      .insert({
        application_id: match.application_id,
        direction: "inbound",
        subject: parsed.subject,
        body: bodyForLog,
        from_email: parsed.from_email,
        from_name: parsed.from_name,
        message_id_header: parsed.message_id,
        in_reply_to_header: parsed.in_reply_to,
        thread_id: threadId ?? null,
        attachments: stored,
        email_provider_id: "inbound",
      })
      .select("id")
      .single();

    messageId = (msg as { id?: string } | null)?.id;

    // Bump thread counters
    if (threadId) {
      const { data: t } = await admin
        .from("email_threads")
        .select("message_count")
        .eq("id", threadId)
        .single();
      const count = ((t as { message_count?: number } | null)?.message_count ?? 0) + 1;
      await admin
        .from("email_threads")
        .update({
          last_message_at: new Date().toISOString(),
          message_count: count,
        })
        .eq("id", threadId);
    }

    await logActivity({
      kind: "email.received",
      targetType: "application",
      targetId: match.application_id,
      description: `Email reçu : ${parsed.subject ?? "(sans sujet)"}`.slice(0, 200),
      data: {
        from_email: parsed.from_email,
        match_via: match.via,
        match_confidence: match.confidence,
        attachments: stored.length,
      },
    });
  }

  return {
    ok: true,
    inbound_email_id: inboundId,
    match,
    message_id: messageId,
    thread_id: threadId,
    attachments: stored,
  };
}

/**
 * Retro-attach an unmatched inbound to an application : updates inbound_emails,
 * creates a messages row + email_thread, logs activity. Used by the
 * "à attribuer" UI (manual matching).
 */
export async function retroAttachInbound(inboundId: string, applicationId: string) {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("inbound_emails")
    .select(
      "id, from_email, from_name, subject, body_text, body_html, message_id, in_reply_to, attachments, status",
    )
    .eq("id", inboundId)
    .single();
  if (!row) throw new Error("inbound not found");
  const r = row as {
    id: string;
    from_email: string;
    from_name: string | null;
    subject: string | null;
    body_text: string | null;
    body_html: string | null;
    message_id: string | null;
    in_reply_to: string | null;
    attachments: unknown;
    status: string;
  };

  await admin
    .from("inbound_emails")
    .update({
      matched_application_id: applicationId,
      matched_via: "manual",
      match_confidence: 1,
      status: "matched",
    })
    .eq("id", inboundId);

  // Thread
  const root = subjectRoot(r.subject);
  let threadId: string | null = null;
  if (root) {
    const { data: existing } = await admin
      .from("email_threads")
      .select("id")
      .eq("application_id", applicationId)
      .ilike("subject_root", root)
      .limit(1)
      .maybeSingle();
    if (existing?.id) threadId = (existing as { id: string }).id;
    else {
      const { data: created } = await admin
        .from("email_threads")
        .insert({
          application_id: applicationId,
          subject_root: root,
          last_message_at: new Date().toISOString(),
          message_count: 0,
        })
        .select("id")
        .single();
      threadId = (created as { id: string } | null)?.id ?? null;
    }
  }

  // Messages row
  const bodyForLog = (r.body_text || (r.body_html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  await admin.from("messages").insert({
    application_id: applicationId,
    direction: "inbound",
    subject: r.subject,
    body: bodyForLog,
    from_email: r.from_email,
    from_name: r.from_name,
    message_id_header: r.message_id,
    in_reply_to_header: r.in_reply_to,
    thread_id: threadId,
    attachments: r.attachments ?? [],
    email_provider_id: "inbound",
  });

  if (threadId) {
    const { data: t } = await admin
      .from("email_threads")
      .select("message_count")
      .eq("id", threadId)
      .single();
    const count = ((t as { message_count?: number } | null)?.message_count ?? 0) + 1;
    await admin
      .from("email_threads")
      .update({
        last_message_at: new Date().toISOString(),
        message_count: count,
      })
      .eq("id", threadId);
  }

  await logActivity({
    kind: "email.received",
    targetType: "application",
    targetId: applicationId,
    description: `Email rattaché manuellement : ${r.subject ?? "(sans sujet)"}`.slice(0, 200),
    data: { from_email: r.from_email, match_via: "manual", inbound_email_id: inboundId },
  });

  return { ok: true, thread_id: threadId };
}
