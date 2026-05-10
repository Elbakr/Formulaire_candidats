// WhatsApp compliance helpers — anti-ban Meta.
//
// Business rules enforced here (see Meta Business Messaging Policy) :
//   1. Le candidat ne doit pas être bloqué (whatsapp_blocked = false).
//   2. Si require_opt_in actif → on exige un opt-in explicite OU un message
//      inbound passé (un reply vaut consentement).
//   3. La fenêtre de service client de 24h : hors fenêtre, on n'envoie QUE
//      via un template approuvé (HSM). Sinon → KO.
//   4. Quotas anti-spam : daily_send_limit, hourly_send_limit, min_seconds_between_sends.
//
// Toutes les vérifs s'appuient sur l'admin client (RLS bypass) — on est en
// server action.

import { createAdminClient } from "@/lib/supabase/server";

export type SendEligibilityReason =
  | "no_opt_in"
  | "blocked"
  | "out_of_window_no_template"
  | "rate_limit_hour"
  | "rate_limit_day"
  | "rate_limit_min_interval"
  | "no_phone"
  | "candidate_not_found";

export type SendEligibility = {
  ok: boolean;
  reason?: SendEligibilityReason;
  hint?: string;
  in24hWindow?: boolean;
  hasOptIn?: boolean;
  isBlocked?: boolean;
};

export type WhatsAppComplianceSettings = {
  require_opt_in: boolean;
  enforce_24h_window: boolean;
  daily_send_limit: number;
  hourly_send_limit: number;
  min_seconds_between_sends: number;
  out_of_window_template_slug: string | null;
};

const DEFAULT_SETTINGS: WhatsAppComplianceSettings = {
  require_opt_in: true,
  enforce_24h_window: true,
  daily_send_limit: 250,
  hourly_send_limit: 60,
  min_seconds_between_sends: 5,
  out_of_window_template_slug: null,
};

const HINT_FR: Record<SendEligibilityReason, string> = {
  no_opt_in:
    "Pas de consentement WhatsApp. Le candidat doit d'abord nous écrire ou cocher l'opt-in.",
  blocked:
    "Ce candidat a été bloqué (STOP / opt-out). Aucun envoi possible.",
  out_of_window_no_template:
    "Hors fenêtre de 24 h depuis le dernier message du candidat — vous devez utiliser un template approuvé Meta.",
  rate_limit_hour:
    "Quota horaire WhatsApp atteint. Réessayez dans quelques minutes.",
  rate_limit_day:
    "Quota quotidien WhatsApp atteint. Réessayez demain ou augmentez la limite.",
  rate_limit_min_interval:
    "Trop d'envois rapprochés vers ce candidat. Patientez quelques secondes.",
  no_phone: "Numéro de téléphone manquant ou invalide pour ce candidat.",
  candidate_not_found: "Candidat introuvable.",
};

export async function getComplianceSettings(): Promise<WhatsAppComplianceSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_settings")
    .select(
      "require_opt_in, enforce_24h_window, daily_send_limit, hourly_send_limit, min_seconds_between_sends, out_of_window_template_slug",
    )
    .eq("id", 1)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;

  return {
    require_opt_in: data.require_opt_in ?? DEFAULT_SETTINGS.require_opt_in,
    enforce_24h_window: data.enforce_24h_window ?? DEFAULT_SETTINGS.enforce_24h_window,
    daily_send_limit: data.daily_send_limit ?? DEFAULT_SETTINGS.daily_send_limit,
    hourly_send_limit: data.hourly_send_limit ?? DEFAULT_SETTINGS.hourly_send_limit,
    min_seconds_between_sends:
      data.min_seconds_between_sends ?? DEFAULT_SETTINGS.min_seconds_between_sends,
    out_of_window_template_slug: data.out_of_window_template_slug ?? null,
  };
}

export type CandidateComplianceState = {
  candidateId: string;
  optIn: boolean;
  optInAt: string | null;
  lastInboundAt: string | null;
  blocked: boolean;
  blockReason: string | null;
};

export async function loadCandidateState(
  candidateId: string,
): Promise<CandidateComplianceState | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("candidates")
    .select(
      "id, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_last_inbound_at, whatsapp_blocked, whatsapp_block_reason",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (!data) return null;
  return {
    candidateId: data.id as string,
    optIn: !!data.whatsapp_opt_in,
    optInAt: (data.whatsapp_opt_in_at as string | null) ?? null,
    lastInboundAt: (data.whatsapp_last_inbound_at as string | null) ?? null,
    blocked: !!data.whatsapp_blocked,
    blockReason: (data.whatsapp_block_reason as string | null) ?? null,
  };
}

export type CheckEligibilityArgs = {
  candidateId: string;
  isTemplate?: boolean;
  templateSlug?: string | null;
};

export async function checkSendEligibility(
  args: CheckEligibilityArgs,
): Promise<SendEligibility> {
  const settings = await getComplianceSettings();
  const state = await loadCandidateState(args.candidateId);
  if (!state) {
    return { ok: false, reason: "candidate_not_found", hint: HINT_FR.candidate_not_found };
  }

  if (state.blocked) {
    return {
      ok: false,
      reason: "blocked",
      hint: HINT_FR.blocked,
      isBlocked: true,
      hasOptIn: state.optIn,
    };
  }

  // 24h window — based on last inbound from candidate.
  const now = Date.now();
  const lastInboundMs = state.lastInboundAt ? new Date(state.lastInboundAt).getTime() : 0;
  const in24hWindow = lastInboundMs > 0 && now - lastInboundMs < 24 * 3600 * 1000;

  // Opt-in check.
  // A reply (lastInboundAt anytime) counts as consent.
  const hasConsent = state.optIn || !!state.lastInboundAt;
  if (settings.require_opt_in && !hasConsent) {
    return {
      ok: false,
      reason: "no_opt_in",
      hint: HINT_FR.no_opt_in,
      in24hWindow: false,
      hasOptIn: false,
      isBlocked: false,
    };
  }

  // 24h window — only enforced when settings ask for it AND we're not sending a template.
  if (settings.enforce_24h_window && !in24hWindow) {
    if (!args.isTemplate || !args.templateSlug) {
      return {
        ok: false,
        reason: "out_of_window_no_template",
        hint: HINT_FR.out_of_window_no_template,
        in24hWindow: false,
        hasOptIn: state.optIn,
        isBlocked: false,
      };
    }
  }

  // Rate limits.
  const admin = createAdminClient();
  const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("email_provider_id", "whatsapp.twilio")
      .gte("created_at", oneHourAgo),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("email_provider_id", "whatsapp.twilio")
      .gte("created_at", oneDayAgo),
  ]);

  if ((hourCount ?? 0) >= settings.hourly_send_limit) {
    return {
      ok: false,
      reason: "rate_limit_hour",
      hint: HINT_FR.rate_limit_hour,
      in24hWindow,
      hasOptIn: state.optIn,
      isBlocked: false,
    };
  }
  if ((dayCount ?? 0) >= settings.daily_send_limit) {
    return {
      ok: false,
      reason: "rate_limit_day",
      hint: HINT_FR.rate_limit_day,
      in24hWindow,
      hasOptIn: state.optIn,
      isBlocked: false,
    };
  }

  // Min interval per candidate.
  const { data: lastForCandidate } = await admin
    .from("messages")
    .select("created_at, applications!inner(candidate_id)")
    .eq("direction", "outbound")
    .eq("email_provider_id", "whatsapp.twilio")
    .eq("applications.candidate_id", args.candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastForCandidate?.created_at) {
    const lastMs = new Date(lastForCandidate.created_at as string).getTime();
    const elapsed = (now - lastMs) / 1000;
    if (elapsed < settings.min_seconds_between_sends) {
      return {
        ok: false,
        reason: "rate_limit_min_interval",
        hint: HINT_FR.rate_limit_min_interval,
        in24hWindow,
        hasOptIn: state.optIn,
        isBlocked: false,
      };
    }
  }

  return {
    ok: true,
    in24hWindow,
    hasOptIn: state.optIn,
    isBlocked: false,
  };
}

/**
 * Get the candidate id for an application (used by send actions).
 */
export async function getCandidateIdForApplication(
  applicationId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("applications")
    .select("candidate_id")
    .eq("id", applicationId)
    .maybeSingle();
  return ((data as { candidate_id: string } | null)?.candidate_id) ?? null;
}

/**
 * Substitute {{1}}, {{2}}, ... with the provided variables. Variables outside
 * the array are left as-is (so a malformed template fails LOUDLY at Twilio
 * level rather than sending a half-baked message).
 */
export function substituteTemplateVariables(
  body: string,
  variables: string[],
): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, idxStr) => {
    const idx = Number(idxStr);
    if (!Number.isFinite(idx) || idx < 1) return match;
    return variables[idx - 1] ?? match;
  });
}

/**
 * Count {{1}}, {{2}}, ... placeholders. Used at template creation time so
 * we can store variables_count and validate at send.
 */
export function countTemplateVariables(body: string): number {
  const matches = body.matchAll(/\{\{\s*(\d+)\s*\}\}/g);
  let max = 0;
  for (const m of matches) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export type WhatsAppTemplate = {
  id: string;
  slug: string;
  language_code: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body: string;
  variables_count: number;
  twilio_content_sid: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getTemplateBySlug(
  slug: string,
): Promise<WhatsAppTemplate | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as WhatsAppTemplate | null) ?? null;
}

export async function listApprovedActiveTemplates(): Promise<WhatsAppTemplate[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_templates")
    .select("*")
    .eq("status", "approved")
    .eq("is_active", true)
    .order("slug");
  return (data ?? []) as WhatsAppTemplate[];
}
