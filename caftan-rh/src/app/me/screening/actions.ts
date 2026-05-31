"use server";

// Karim 2026-05-31 : actions screening côté candidat.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  scoreAnswer,
  computeFinalScore,
  type ScreeningQuestion,
} from "@/lib/screening-scoring";

export async function getOrCreateMyScreeningResponseAction(): Promise<
  { ok: true; responseId: string; questionnaireId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const admin = createAdminClient();
  const { data: cand } = await admin.from("candidates").select("id").eq("profile_id", user.id).maybeSingle();
  if (!cand) return { ok: false, error: "Profil candidat introuvable" };

  const { data: q } = await admin
    .from("screening_questionnaires")
    .select("id")
    .eq("is_default", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!q) return { ok: false, error: "Aucun questionnaire actif" };

  const { data: existing } = await admin
    .from("screening_responses")
    .select("id")
    .eq("candidate_id", cand.id)
    .eq("questionnaire_id", q.id)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { ok: true, responseId: existing.id, questionnaireId: q.id };

  const { data: created, error } = await admin
    .from("screening_responses")
    .insert({ candidate_id: cand.id, questionnaire_id: q.id })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, responseId: created.id, questionnaireId: q.id };
}

export async function answerScreeningQuestionAction(
  responseId: string,
  questionId: string,
  value: { value_text?: string | null; value_num?: number | null; value_array?: unknown[] | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };
  const admin = createAdminClient();

  const { data: q } = await admin
    .from("screening_questions")
    .select("id, category, question_text, question_subtitle, type, options, weight, is_required, is_red_flag_question")
    .eq("id", questionId)
    .single();
  if (!q) return { ok: false, error: "Question introuvable" };

  const scored = scoreAnswer(q as unknown as ScreeningQuestion, {
    question_id: questionId,
    value_text: value.value_text ?? null,
    value_num: value.value_num ?? null,
    value_array: value.value_array ?? null,
  });

  // Upsert (1 réponse par question pour cette response)
  const { error: delErr } = await admin
    .from("screening_answers")
    .delete()
    .eq("response_id", responseId)
    .eq("question_id", questionId);
  if (delErr) return { ok: false, error: delErr.message };

  const { error } = await admin.from("screening_answers").insert({
    response_id: responseId,
    question_id: questionId,
    value_text: value.value_text ?? null,
    value_num: value.value_num ?? null,
    value_array: value.value_array ?? null,
    score_obtained: scored.score_obtained,
    is_red_flag_triggered: scored.is_red_flag_triggered,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitScreeningResponseAction(
  responseId: string,
): Promise<{ ok: boolean; error?: string; recommendation?: string; totalScore?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };
  const admin = createAdminClient();

  const { data: response } = await admin
    .from("screening_responses")
    .select("id, questionnaire_id")
    .eq("id", responseId)
    .single();
  if (!response) return { ok: false, error: "Réponse introuvable" };

  const { data: questionnaire } = await admin
    .from("screening_questionnaires")
    .select("min_score_to_hire")
    .eq("id", response.questionnaire_id)
    .single();
  const minScore = Number(questionnaire?.min_score_to_hire ?? 65);

  const { data: questions } = await admin
    .from("screening_questions")
    .select("id, category, question_text, question_subtitle, type, options, weight, is_required, is_red_flag_question")
    .eq("questionnaire_id", response.questionnaire_id);
  const { data: answers } = await admin
    .from("screening_answers")
    .select("question_id, score_obtained, is_red_flag_triggered, value_text, value_num, value_array")
    .eq("response_id", responseId);

  // Recompute avec les questions originales (score_max_possible non stocké en BD)
  const qList = (questions ?? []) as unknown as ScreeningQuestion[];
  const qById = new Map(qList.map((q) => [q.id, q]));
  const scoredAnswers = (answers ?? []).map((a) => {
    const q = qById.get(a.question_id);
    if (!q) return { question_id: a.question_id, score_obtained: 0, score_max_possible: 0, is_red_flag_triggered: false };
    return scoreAnswer(q, { question_id: a.question_id, value_text: a.value_text, value_num: a.value_num, value_array: a.value_array as unknown[] | null });
  });

  const final = computeFinalScore(qList, scoredAnswers, minScore);

  const { error } = await admin
    .from("screening_responses")
    .update({
      completed_at: new Date().toISOString(),
      total_score: final.totalScore,
      category_scores: final.categoryScores,
      has_red_flag: final.hasRedFlag,
      recommendation: final.recommendation,
    })
    .eq("id", responseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/screening");
  return { ok: true, recommendation: final.recommendation, totalScore: final.totalScore };
}
