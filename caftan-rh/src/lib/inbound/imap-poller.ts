// Polls a Gmail (or any IMAP) inbox via IMAP, parses emails, dedups against
// our `inbound_emails` table by message_id, and feeds each new email through
// `processInbound()` (Wave 1 pipeline).
//
// Designed to run from a cron route OR a local script. Read-only on the
// mailbox: never marks messages as Seen, never moves/deletes — dedup is
// handled in our DB.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseInbound } from "./parse";
import { processInbound } from "./process";
import { createAdminClient } from "@/lib/supabase/server";

export type PollOptions = {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  mailbox?: string;
  /** Fetch emails received within the last N days. Default 7. */
  sinceDays?: number;
  /** Cap per run to avoid runaway. Default 50. */
  maxPerRun?: number;
};

export type PollResult = {
  ok: boolean;
  fetched: number;
  processed: number;
  skipped_duplicates: number;
  matched: number;
  unmatched: number;
  errors: Array<{ subject?: string | null; from?: string | null; error: string }>;
  duration_ms: number;
};

export async function pollImapInbox(opts: PollOptions = {}): Promise<PollResult> {
  const start = Date.now();
  const user = opts.user ?? process.env.GMAIL_USER;
  const pass = opts.password ?? process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER ou GMAIL_APP_PASSWORD manquant. Renseigne-les dans .env.local.",
    );
  }

  const sinceDays = opts.sinceDays ?? 7;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const maxPerRun = opts.maxPerRun ?? 50;

  const result: PollResult = {
    ok: true,
    fetched: 0,
    processed: 0,
    skipped_duplicates: 0,
    matched: 0,
    unmatched: 0,
    errors: [],
    duration_ms: 0,
  };

  // Pre-compute dedup set from our DB
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("inbound_emails")
    .select("message_id")
    .gte("received_at", since.toISOString());
  const seenIds = new Set<string>(
    ((existing ?? []) as { message_id: string | null }[])
      .map((r) => r.message_id)
      .filter((m): m is string => !!m),
  );

  const client = new ImapFlow({
    host: opts.host ?? "imap.gmail.com",
    port: opts.port ?? 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(opts.mailbox ?? "INBOX");
    try {
      const messages: Array<{ uid: number; source: Buffer | null }> = [];
      // imapflow.fetch with { since: Date } translates to IMAP SINCE search
      for await (const msg of client.fetch(
        { since },
        { uid: true, source: true, envelope: true },
        { uid: true },
      )) {
        if (msg.source) {
          messages.push({ uid: msg.uid as number, source: msg.source as Buffer });
        }
        if (messages.length >= maxPerRun) break;
      }

      result.fetched = messages.length;

      for (const m of messages) {
        if (!m.source) continue;
        let parsedMail;
        try {
          parsedMail = await simpleParser(m.source);
        } catch (e) {
          result.errors.push({ error: `parse: ${(e as Error).message}` });
          continue;
        }

        const messageId = parsedMail.messageId ?? null;
        if (messageId && seenIds.has(messageId)) {
          result.skipped_duplicates += 1;
          continue;
        }

        // Convert mailparser shape → our parseInbound() shape
        const fromObj = parsedMail.from?.value?.[0];
        const toRaw = parsedMail.to;
        const toObj = Array.isArray(toRaw)
          ? toRaw[0]?.value?.[0]
          : toRaw?.value?.[0];

        const refs = Array.isArray(parsedMail.references)
          ? parsedMail.references.join(" ")
          : (parsedMail.references ?? null);

        const attachments = (parsedMail.attachments ?? []).map((a) => ({
          filename: a.filename ?? "attachment.bin",
          content_type: a.contentType ?? "application/octet-stream",
          content_base64:
            a.content && Buffer.isBuffer(a.content)
              ? a.content.toString("base64")
              : "",
          size: a.size,
        })).filter((a) => a.content_base64.length > 0);

        const headersObj: Record<string, unknown> = {};
        try {
          parsedMail.headers?.forEach((value, key) => {
            headersObj[key] = value;
          });
        } catch {
          /* ignore */
        }

        const inbound = parseInbound({
          from: fromObj
            ? { email: fromObj.address ?? "", name: fromObj.name ?? null }
            : null,
          to: toObj ? { email: toObj.address ?? "" } : null,
          subject: parsedMail.subject ?? null,
          text: parsedMail.text ?? null,
          html: parsedMail.html === false ? null : parsedMail.html ?? null,
          message_id: messageId,
          in_reply_to: parsedMail.inReplyTo ?? null,
          references: refs,
          headers: headersObj,
          attachments,
        });

        try {
          const r = await processInbound(inbound);
          result.processed += 1;
          if (r.match.application_id) result.matched += 1;
          else result.unmatched += 1;
          if (messageId) seenIds.add(messageId);
        } catch (e) {
          result.errors.push({
            subject: parsedMail.subject ?? null,
            from: fromObj?.address ?? null,
            error: (e as Error).message,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  result.duration_ms = Date.now() - start;
  return result;
}
