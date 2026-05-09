#!/usr/bin/env node
// Lance manuellement un sync IMAP -> inbound emails -> messages.
// Usage: node scripts/inbound-poll.mjs [--days N] [--max N]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const sinceDays = parseInt(arg("days", "7"), 10);
const maxPerRun = parseInt(arg("max", "50"), 10);

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
if (!user || !pass) {
  console.error("Manque GMAIL_USER ou GMAIL_APP_PASSWORD dans .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const since = new Date(Date.now() - sinceDays * 86_400_000);
console.log(`→ Connexion IMAP ${user} (depuis ${since.toISOString().slice(0,10)})`);

const { data: existing } = await supabase
  .from("inbound_emails")
  .select("message_id")
  .gte("received_at", since.toISOString());
const seenIds = new Set((existing ?? []).map(r => r.message_id).filter(Boolean));
console.log(`  ${seenIds.size} message_ids deja en base sur la fenetre`);

const client = new ImapFlow({
  host: "imap.gmail.com", port: 993, secure: true,
  auth: { user, pass }, logger: false,
});

let processed = 0, skipped = 0, errors = 0, fetched = 0;

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const buffer = [];
  for await (const m of client.fetch({ since }, { uid: true, source: true })) {
    buffer.push({ uid: m.uid, source: m.source });
    fetched++;
    if (buffer.length >= maxPerRun) break;
  }
  console.log(`  ${fetched} messages recuperes — traitement…`);

  for (const m of buffer) {
    if (!m.source) continue;
    try {
      const parsed = await simpleParser(m.source);
      if (parsed.messageId && seenIds.has(parsed.messageId)) {
        skipped++; continue;
      }

      const fromObj = parsed.from?.value?.[0];
      const toObj = parsed.to?.value?.[0] || (Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0] : null);

      // ── Match candidate by from email ───────────
      const fromEmail = (fromObj?.address ?? "").toLowerCase();
      let appId = null, via = null, confidence = 0;
      if (fromEmail) {
        const { data: cand } = await supabase
          .from("candidates").select("id").eq("email", fromEmail).maybeSingle();
        if (cand?.id) {
          const { data: app } = await supabase
            .from("applications").select("id").eq("candidate_id", cand.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (app?.id) { appId = app.id; via = "from_email"; confidence = 1.0; }
        }
      }
      if (!appId && parsed.subject) {
        const tag = parsed.subject.match(/\[#APP-([0-9a-fA-F-]{6,})\]/);
        if (tag) {
          const short = tag[1].toLowerCase();
          const { data: byTag } = await supabase
            .from("applications").select("id")
            .ilike("id", `${short}%`).limit(1).maybeSingle();
          if (byTag?.id) { appId = byTag.id; via = "subject_tag"; confidence = 0.95; }
        }
      }
      if (!appId && parsed.inReplyTo) {
        const { data: byInReply } = await supabase
          .from("messages").select("application_id")
          .eq("message_id_header", parsed.inReplyTo).maybeSingle();
        if (byInReply?.application_id) { appId = byInReply.application_id; via = "in_reply_to"; confidence = 0.95; }
      }

      // ── Insert inbound_email ────────────────────
      const { data: row } = await supabase.from("inbound_emails").insert({
        from_email: fromEmail,
        from_name: fromObj?.name ?? null,
        to_email: toObj?.address ?? null,
        subject: parsed.subject ?? null,
        body_text: parsed.text ?? null,
        body_html: typeof parsed.html === "string" ? parsed.html : null,
        message_id: parsed.messageId ?? null,
        in_reply_to: parsed.inReplyTo ?? null,
        references_header: Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references ?? null),
        headers: {},
        raw: { source: "imap-script" },
        attachments: [],
        matched_application_id: appId,
        matched_via: via,
        match_confidence: confidence,
        status: appId ? "matched" : "unmatched",
      }).select("id").single();

      // ── If matched, write a messages row ─────────
      if (appId && row?.id) {
        const subjectRoot = (parsed.subject ?? "")
          .replace(/\s*\[#APP-[0-9a-fA-F-]+\]\s*/g, " ")
          .replace(/^\s*(re|ré|fwd|tr|fw|aw)\s*:\s*/i, "")
          .replace(/\s+/g, " ").trim().slice(0, 250);

        // find or create thread
        let threadId = null;
        if (subjectRoot) {
          const { data: th } = await supabase
            .from("email_threads").select("id")
            .eq("application_id", appId).ilike("subject_root", subjectRoot)
            .maybeSingle();
          if (th?.id) threadId = th.id;
          else {
            const { data: nt } = await supabase.from("email_threads").insert({
              application_id: appId, subject_root: subjectRoot,
              last_message_at: new Date().toISOString(), message_count: 0,
            }).select("id").single();
            threadId = nt?.id ?? null;
          }
        }

        await supabase.from("messages").insert({
          application_id: appId,
          direction: "inbound",
          subject: parsed.subject,
          body: (parsed.text || (parsed.html || "").toString().replace(/<[^>]+>/g, " "))
            .replace(/\s+/g, " ").trim().slice(0, 5000),
          from_email: fromEmail,
          from_name: fromObj?.name ?? null,
          message_id_header: parsed.messageId,
          in_reply_to_header: parsed.inReplyTo,
          thread_id: threadId,
          attachments: [],
          email_provider_id: "imap",
        });

        if (threadId) {
          const { data: t } = await supabase.from("email_threads").select("message_count").eq("id", threadId).single();
          await supabase.from("email_threads").update({
            last_message_at: new Date().toISOString(),
            message_count: ((t?.message_count ?? 0) + 1),
          }).eq("id", threadId);
        }
      }

      if (parsed.messageId) seenIds.add(parsed.messageId);
      processed++;
      const tag = appId ? "✓ matché" : "·  non matché";
      console.log(`  ${tag} | ${fromObj?.address ?? "?"} | ${(parsed.subject ?? "(sans sujet)").slice(0, 60)}`);
    } catch (e) {
      errors++;
      console.error("  ✗", e.message);
    }
  }
} finally {
  lock.release();
  await client.logout().catch(() => {});
}

console.log(`\nDone. fetched=${fetched} processed=${processed} duplicates=${skipped} errors=${errors}`);
