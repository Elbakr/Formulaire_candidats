// Normalize an inbound email payload (Resend Inbound shape — flexible) into the
// row shape we store in `inbound_emails`. Resend Inbound delivers JSON like:
//   { from: "Foo <foo@bar.com>", to: "...", subject: "...", text: "...", html: "...",
//     headers: {...}, message_id: "<...>", in_reply_to: "<...>", references: "...",
//     attachments: [{ filename, content_type, content_base64, size }] }
// We accept `from` as either a string ("Foo <foo@bar.com>") or an object
// `{ email, name }`. Several alternative key spellings are tolerated for
// resilience against minor provider variations.

export type ParsedAttachment = {
  filename: string;
  content_type: string;
  content_base64: string;
  size?: number;
};

export type ParsedInbound = {
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  headers: Record<string, unknown>;
  raw: Record<string, unknown>;
  attachments: ParsedAttachment[];
};

function parseAddress(input: unknown): { email: string; name: string | null } {
  if (!input) return { email: "", name: null };
  if (typeof input === "object" && input !== null) {
    const o = input as { email?: string; name?: string; address?: string };
    return {
      email: String(o.email ?? o.address ?? "").trim().toLowerCase(),
      name: o.name ? String(o.name) : null,
    };
  }
  const s = String(input).trim();
  // "Foo Bar <foo@bar.com>" or "<foo@bar.com>" or "foo@bar.com"
  const m = s.match(/^\s*(?:"?([^"<]+?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (m) {
    return {
      email: m[2].toLowerCase(),
      name: m[1] ? m[1].trim() : null,
    };
  }
  return { email: s.toLowerCase(), name: null };
}

function pickString(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickHeaders(o: Record<string, unknown>): Record<string, unknown> {
  const h = o.headers ?? o.header ?? {};
  if (typeof h === "object" && h !== null) return h as Record<string, unknown>;
  return {};
}

function pickAttachments(o: Record<string, unknown>): ParsedAttachment[] {
  const list = (o.attachments ?? o.files ?? []) as unknown;
  if (!Array.isArray(list)) return [];
  const out: ParsedAttachment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const filename = (a.filename as string) ?? (a.name as string) ?? "attachment.bin";
    const content_type =
      (a.content_type as string) ?? (a.contentType as string) ?? (a.mime as string) ?? "application/octet-stream";
    const content_base64 =
      (a.content_base64 as string) ?? (a.contentBase64 as string) ?? (a.content as string) ?? null;
    if (!content_base64 || typeof content_base64 !== "string") continue;
    const size = typeof a.size === "number" ? (a.size as number) : undefined;
    out.push({ filename, content_type, content_base64, size });
  }
  return out;
}

export function parseInbound(payload: unknown): ParsedInbound {
  const raw = (typeof payload === "object" && payload !== null
    ? payload
    : { value: payload }) as Record<string, unknown>;

  const fromAddr = parseAddress(raw.from ?? raw.From ?? raw.sender);
  const toRaw = raw.to ?? raw.To ?? raw.recipient;
  const toAddr = Array.isArray(toRaw) ? parseAddress(toRaw[0]) : parseAddress(toRaw);
  const headers = pickHeaders(raw);

  const message_id =
    pickString(raw, "message_id", "messageId", "Message-Id", "Message-ID") ??
    (typeof headers === "object" ? pickString(headers as Record<string, unknown>, "Message-Id", "Message-ID", "message-id") : null);
  const in_reply_to =
    pickString(raw, "in_reply_to", "inReplyTo", "In-Reply-To") ??
    (typeof headers === "object" ? pickString(headers as Record<string, unknown>, "In-Reply-To", "in-reply-to") : null);
  const references_header =
    pickString(raw, "references", "References") ??
    (typeof headers === "object" ? pickString(headers as Record<string, unknown>, "References", "references") : null);

  return {
    from_email: fromAddr.email,
    from_name: fromAddr.name,
    to_email: toAddr.email || null,
    subject: pickString(raw, "subject", "Subject"),
    body_text: pickString(raw, "text", "body_text", "bodyPlain", "plain"),
    body_html: pickString(raw, "html", "body_html", "bodyHtml"),
    message_id,
    in_reply_to,
    references_header,
    headers,
    raw,
    attachments: pickAttachments(raw),
  };
}

/**
 * Extract a short application id token from a subject like "[#APP-12345678] Re: ..." */
export function extractAppTagFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const m = subject.match(/\[#APP-([0-9a-fA-F-]{6,})\]/);
  return m ? m[1].toLowerCase() : null;
}

/** Strip "Re:" / "Fwd:" prefixes for thread root comparison. */
export function subjectRoot(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = subject.trim();
  // Remove [#APP-xxx] tag
  s = s.replace(/\s*\[#APP-[0-9a-fA-F-]+\]\s*/g, " ").trim();
  // Strip leading "Re:" / "Fwd:" (multiple)
  while (true) {
    const next = s.replace(/^\s*(re|ré|réponse|fwd|tr|fw|aw)\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim().slice(0, 250);
}
