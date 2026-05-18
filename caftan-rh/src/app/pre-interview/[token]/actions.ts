"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import {
  loadPreInterviewByToken,
  loadQuestionsFor,
} from "@/lib/pre-interview";
import type { PreInterviewQuestionKind } from "@/lib/pre-interview-types";

type ActionResult = { ok: true } | { ok: false; error: string };

function isValidScale(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 5;
}

/**
 * Public, no-auth save action used by the candidate-facing form.
 * Validates the token, then upserts a single response (one row per (instance, question)).
 */
export async function saveResponseAction(input: {
  token: string;
  questionId: string;
  answerText?: string | null;
  answerChoices?: string[] | null;
  answerScale?: number | null;
}): Promise<ActionResult> {
  if (!input.token || !input.questionId) {
    return { ok: false, error: "Données manquantes." };
  }

  const pi = await loadPreInterviewByToken(input.token);
  if (!pi) return { ok: false, error: "Lien invalide." };
  if (pi.status === "completed") {
    return { ok: false, error: "Pré-entretien déjà soumis." };
  }
  if (pi.status === "discarded") {
    return { ok: false, error: "Pré-entretien annulé." };
  }
  if (pi.expires_at && new Date(pi.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Le délai de réponse est expiré." };
  }

  const admin = createAdminClient();

  // Validate question belongs to the question bank
  const { data: q } = await admin
    .from("pre_interview_questions")
    .select("id, kind, max_chars, choices")
    .eq("id", input.questionId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Question inconnue." };

  type QRow = {
    id: string;
    kind: PreInterviewQuestionKind;
    max_chars: number;
    choices: { value: string }[] | null;
  };
  const qq = q as QRow;

  const payload: {
    pre_interview_id: string;
    question_id: string;
    answer_text: string | null;
    answer_choices: string[] | null;
    answer_scale: number | null;
    answered_at: string;
  } = {
    pre_interview_id: pi.id,
    question_id: input.questionId,
    answer_text: null,
    answer_choices: null,
    answer_scale: null,
    answered_at: new Date().toISOString(),
  };

  if (qq.kind === "text") {
    const txt = (input.answerText ?? "").slice(0, qq.max_chars || 5000);
    payload.answer_text = txt;
  } else if (qq.kind === "scale_1_5") {
    payload.answer_scale = isValidScale(input.answerScale) ? input.answerScale : null;
  } else if (qq.kind === "single_choice" || qq.kind === "multi_choice") {
    const allowed = new Set((qq.choices ?? []).map((c) => c.value));
    const choices = (input.answerChoices ?? []).filter((c) => allowed.has(c));
    if (qq.kind === "single_choice" && choices.length > 1) choices.length = 1;
    // Karim 18/05 : si single_choice et choix vide recu, on REFUSE d ecraser
    // une valeur existante (ancien bundle client peut envoyer [] par toggle
    // accidentel). C est une protection serveur defensive.
    if (qq.kind === "single_choice" && choices.length === 0) {
      const { data: prev } = await admin
        .from("pre_interview_responses")
        .select("answer_choices")
        .eq("pre_interview_id", pi.id)
        .eq("question_id", input.questionId)
        .maybeSingle();
      const prevArr = (prev as { answer_choices?: string[] } | null)?.answer_choices;
      if (Array.isArray(prevArr) && prevArr.length > 0) {
        // Ne rien changer : on retourne ok pour ne pas casser le UI.
        return { ok: true };
      }
    }
    payload.answer_choices = choices;
  } else if (qq.kind === "video") {
    // Fallback texte pour browsers sans MediaRecorder. Le path vidéo lui
    // passe par saveVideoResponseAction (server action séparée).
    const txt = (input.answerText ?? "").slice(0, 2000);
    payload.answer_text = txt;
  }

  // Upsert (unique on pre_interview_id + question_id)
  const { error: upErr } = await admin
    .from("pre_interview_responses")
    .upsert(payload, { onConflict: "pre_interview_id,question_id" });
  if (upErr) return { ok: false, error: upErr.message };

  // Mark started_at on first response
  if (!pi.started_at) {
    await admin
      .from("pre_interviews")
      .update({ started_at: new Date().toISOString(), status: "started" })
      .eq("id", pi.id);
  }

  return { ok: true };
}

/**
 * Public, no-auth submit action: marks the pre-interview as completed
 * (ensures all required questions have an answer first).
 */
export async function submitPreInterviewAction(input: {
  token: string;
}): Promise<ActionResult> {
  if (!input.token) return { ok: false, error: "Token manquant." };
  const pi = await loadPreInterviewByToken(input.token);
  if (!pi) return { ok: false, error: "Lien invalide." };
  if (pi.status === "completed") {
    return { ok: false, error: "Déjà soumis." };
  }
  if (pi.status === "discarded") {
    return { ok: false, error: "Pré-entretien annulé." };
  }
  if (pi.expires_at && new Date(pi.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Le délai de réponse est expiré." };
  }

  const questions = await loadQuestionsFor(pi.position_role, pi.language_code);
  const required = questions.filter((q) => q.is_required);

  const admin = createAdminClient();
  const { data: rData } = await admin
    .from("pre_interview_responses")
    .select("question_id, answer_text, answer_choices, answer_scale, video_storage_path")
    .eq("pre_interview_id", pi.id);

  const answered = new Set<string>();
  for (const r of (rData ?? []) as Array<{
    question_id: string;
    answer_text: string | null;
    answer_choices: string[] | null;
    answer_scale: number | null;
    video_storage_path: string | null;
  }>) {
    const ok =
      (r.answer_text?.trim().length ?? 0) > 0 ||
      (Array.isArray(r.answer_choices) && r.answer_choices.length > 0) ||
      typeof r.answer_scale === "number" ||
      (typeof r.video_storage_path === "string" && r.video_storage_path.length > 0);
    if (ok) answered.add(r.question_id);
  }
  for (const q of required) {
    if (!answered.has(q.id)) {
      return {
        ok: false,
        error: "Merci de répondre à toutes les questions obligatoires avant de soumettre.",
      };
    }
  }

  const { error: updErr } = await admin
    .from("pre_interviews")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", pi.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Notify RH
  const { data: rhUsers } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "rh"]);
  const recipients = ((rhUsers ?? []) as { id: string }[]).map((u) => u.id);
  if (recipients.length > 0) {
    await admin.from("notifications").insert(
      recipients.map((rid) => ({
        recipient_id: rid,
        kind: "pre_interview_done",
        title: "Pré-entretien complété",
        body: "Un candidat a soumis ses réponses au pré-entretien.",
        link: `/rh/candidates/${pi.application_id}`,
        data: { application_id: pi.application_id, pre_interview_id: pi.id },
      })),
    );
  }

  await logActivity({
    kind: "pre_interview.completed",
    targetType: "application",
    targetId: pi.application_id,
    description: "Pré-entretien complété par le candidat",
    data: { pre_interview_id: pi.id },
  });

  return { ok: true };
}
