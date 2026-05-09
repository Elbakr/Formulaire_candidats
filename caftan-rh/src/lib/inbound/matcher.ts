// Cascade matching for inbound emails.
//
// Order :
//   1. from_email exact match → candidates.email (lowercased) → newest open application
//   2. in_reply_to header → messages.message_id_header → application_id
//   3. subject contains [#APP-<short>] → applications where id starts with short
//   4. body contains a candidate full_name (case-insensitive substring)
//   5. fallback : status=unmatched
//
// Returns { application_id, via, confidence }. Higher = better.

import { createAdminClient } from "@/lib/supabase/server";
import { extractAppTagFromSubject } from "./parse";

export type MatchResult = {
  application_id: string | null;
  via: "from_email" | "in_reply_to" | "subject" | "body" | "manual" | "unmatched";
  confidence: number;
};

export type MatchInput = {
  from_email: string;
  in_reply_to: string | null;
  subject: string | null;
  body_text: string | null;
};

export async function matchInbound(input: MatchInput): Promise<MatchResult> {
  const admin = createAdminClient();

  // 1. from_email
  if (input.from_email) {
    const { data: cand } = await admin
      .from("candidates")
      .select("id")
      .ilike("email", input.from_email)
      .limit(1)
      .maybeSingle();

    if (cand?.id) {
      const { data: app } = await admin
        .from("applications")
        .select("id, status")
        .eq("candidate_id", cand.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (app?.id) {
        return { application_id: app.id, via: "from_email", confidence: 0.98 };
      }
    }
  }

  // 2. in_reply_to → messages.message_id_header
  if (input.in_reply_to) {
    const irt = input.in_reply_to.trim();
    const { data: msg } = await admin
      .from("messages")
      .select("application_id")
      .eq("message_id_header", irt)
      .limit(1)
      .maybeSingle();
    if (msg?.application_id) {
      return { application_id: msg.application_id, via: "in_reply_to", confidence: 0.99 };
    }
    // Some providers wrap the id in <...> already, try without brackets
    const stripped = irt.replace(/^<|>$/g, "");
    if (stripped !== irt) {
      const { data: msg2 } = await admin
        .from("messages")
        .select("application_id")
        .eq("message_id_header", stripped)
        .limit(1)
        .maybeSingle();
      if (msg2?.application_id) {
        return { application_id: msg2.application_id, via: "in_reply_to", confidence: 0.99 };
      }
    }
  }

  // 3. subject [#APP-xxxxxxxx]
  const tag = extractAppTagFromSubject(input.subject);
  if (tag) {
    const { data: apps } = await admin
      .from("applications")
      .select("id")
      .ilike("id", `${tag}%`)
      .limit(2);
    if (apps && apps.length === 1) {
      return { application_id: apps[0].id, via: "subject", confidence: 0.95 };
    }
    // ambiguous (multiple) — fall through but lower confidence handled by caller
  }

  // 4. body contains candidate full_name
  if (input.body_text && input.body_text.length > 5) {
    // Pull candidate names that have an open recent application — bound the search
    const { data: cands } = await admin
      .from("candidates")
      .select("id, full_name")
      .not("full_name", "is", null)
      .limit(5000);
    if (cands && cands.length > 0) {
      const body = input.body_text.toLowerCase();
      // Prefer longer names first (less ambiguous)
      const sorted = [...cands].sort(
        (a, b) => (b.full_name?.length ?? 0) - (a.full_name?.length ?? 0),
      );
      for (const c of sorted) {
        const fn = (c.full_name ?? "").trim().toLowerCase();
        if (fn.length < 6) continue; // avoid matching short common names
        if (body.includes(fn)) {
          const { data: app } = await admin
            .from("applications")
            .select("id")
            .eq("candidate_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (app?.id) {
            return { application_id: app.id, via: "body", confidence: 0.7 };
          }
        }
      }
    }
  }

  return { application_id: null, via: "unmatched", confidence: 0 };
}
