// Server-only helpers for the Pre-Interview module (V1 écrit).
// All read paths use the admin client when bypassing RLS is required
// (e.g. the public token URL — the candidate isn't authenticated).

import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type {
  PreInterview,
  PreInterviewQuestion,
  PreInterviewResponse,
  PreInterviewWithResponses,
} from "@/lib/pre-interview-types";

export const PRE_INTERVIEW_TOKEN_LENGTH = 32;
export const PRE_INTERVIEW_DURATION_DAYS = 5;

/** 32-char cryptographically random hex token (16 bytes -> 32 chars). */
export function generateToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Load active questions for a given role + language.
 * Always includes role='all' as a fallback baseline, then any role-specific.
 */
export async function loadQuestionsFor(
  positionRole: string,
  language: string = "fr",
): Promise<PreInterviewQuestion[]> {
  const admin = createAdminClient();
  const roles = positionRole === "all" ? ["all"] : ["all", positionRole];
  const { data, error } = await admin
    .from("pre_interview_questions")
    .select(
      "id, slug, position_role, language_code, prompt, kind, choices, min_chars, max_chars, is_required, sort_order, is_active, video_max_seconds",
    )
    .eq("is_active", true)
    .eq("language_code", language)
    .in("position_role", roles)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[pre-interview] loadQuestionsFor error:", error.message);
    return [];
  }
  return (data ?? []) as PreInterviewQuestion[];
}

/**
 * Public lookup by token (no auth) — used by the candidate-facing page.
 * Bypasses RLS via service role.
 */
export async function loadPreInterviewByToken(
  token: string,
): Promise<PreInterview | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pre_interviews")
    .select(
      "id, application_id, position_role, token, language_code, sent_at, expires_at, started_at, completed_at, status, reviewer_id, reviewed_at, decision, decision_note, created_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.warn("[pre-interview] loadPreInterviewByToken error:", error.message);
    return null;
  }
  return (data as PreInterview | null) ?? null;
}

/**
 * RH-side full payload (instance + questions + existing responses).
 * Uses the user-bound client so RLS scopes correctly.
 */
export async function loadPreInterviewWithResponses(
  preInterviewId: string,
): Promise<PreInterviewWithResponses | null> {
  const supabase = await createClient();
  const { data: pi, error: e1 } = await supabase
    .from("pre_interviews")
    .select(
      "id, application_id, position_role, token, language_code, sent_at, expires_at, started_at, completed_at, status, reviewer_id, reviewed_at, decision, decision_note, created_at",
    )
    .eq("id", preInterviewId)
    .maybeSingle();
  if (e1 || !pi) return null;

  const preInterview = pi as PreInterview;
  const [questions, { data: rData }] = await Promise.all([
    loadQuestionsFor(preInterview.position_role, preInterview.language_code),
    supabase
      .from("pre_interview_responses")
      .select(
        "id, pre_interview_id, question_id, answer_text, answer_choices, answer_scale, answered_at, video_storage_path, video_duration_sec, video_purge_after",
      )
      .eq("pre_interview_id", preInterviewId),
  ]);
  return {
    preInterview,
    questions,
    responses: ((rData ?? []) as PreInterviewResponse[]),
  };
}

/**
 * Same as above, but admin client (token/public flow).
 */
export async function loadPreInterviewBundleByToken(
  token: string,
): Promise<PreInterviewWithResponses | null> {
  const pi = await loadPreInterviewByToken(token);
  if (!pi) return null;

  const admin = createAdminClient();
  const [questions, { data: rData }] = await Promise.all([
    loadQuestionsFor(pi.position_role, pi.language_code),
    admin
      .from("pre_interview_responses")
      .select(
        "id, pre_interview_id, question_id, answer_text, answer_choices, answer_scale, answered_at, video_storage_path, video_duration_sec, video_purge_after",
      )
      .eq("pre_interview_id", pi.id),
  ]);
  return {
    preInterview: pi,
    questions,
    responses: ((rData ?? []) as PreInterviewResponse[]),
  };
}

/**
 * Build the public URL for a pre-interview token.
 * Uses NEXT_PUBLIC_SITE_URL when available, falls back to a relative path.
 */
export function preInterviewPublicUrl(token: string, baseUrlOverride?: string): string {
  const base =
    baseUrlOverride ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "";
  const path = `/pre-interview/${token}`;
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Format the deadline (expires_at) as a French short date for emails.
 */
export function formatDeadlineFR(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
