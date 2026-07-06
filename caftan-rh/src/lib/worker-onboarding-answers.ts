// Karim 2026-07-06 : résolution des RÉPONSES au questionnaire d'accueil
// (onboarding) pour un EMPLOYÉ, à afficher sur sa fiche RH.
//
// Chaîne de résolution :
//   employees.candidate_id
//     -> applications (candidate_id)            [toutes les candidatures du candidat]
//     -> pre_interviews (application_id, context='onboarding')
//        on garde l'instance la plus pertinente : completed en priorité, puis la
//        plus récente.
//     -> pre_interview_responses (pre_interview_id)
//     -> pre_interview_questions (par id des réponses)
//
// On charge les questions PAR ID des réponses (et non par langue) : le
// travailleur a pu répondre en FR ou en NL (jeux de questions distincts par
// langue), donc joindre par language_code raterait le prompt. Joindre par id
// garantit toujours le bon libellé.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PreInterviewQuestionChoice,
  PreInterviewQuestionKind,
} from "@/lib/pre-interview-types";

export interface OnboardingAnswer {
  questionId: string;
  prompt: string;
  kind: PreInterviewQuestionKind;
  sortOrder: number;
  answerText: string | null;
  answerChoices: string[] | null;
  answerScale: number | null;
  /** Labels lisibles pour les choix (résolus depuis `choices`, pas la value brute). */
  choiceLabels: string[];
}

export interface OnboardingAnswers {
  preInterviewId: string;
  status: string;
  completedAt: string | null;
  answers: OnboardingAnswer[];
}

export async function loadOnboardingAnswersForEmployee(
  admin: SupabaseClient,
  employeeId: string,
): Promise<OnboardingAnswers | null> {
  // 1) candidate_id de l'employé.
  const { data: empRow } = await admin
    .from("employees")
    .select("candidate_id")
    .eq("id", employeeId)
    .maybeSingle();
  const candidateId = (empRow as { candidate_id: string | null } | null)?.candidate_id;
  if (!candidateId) return null;

  // 2) candidatures du candidat.
  const { data: appRows } = await admin
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId);
  const appIds = ((appRows ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (appIds.length === 0) return null;

  // 3) pre_interviews d'accueil (context='onboarding') : completed d'abord, puis
  //    la plus récente.
  const { data: piRows } = await admin
    .from("pre_interviews")
    .select("id, status, completed_at, created_at")
    .in("application_id", appIds)
    .eq("context", "onboarding")
    .order("created_at", { ascending: false });
  const pis = (piRows ?? []) as Array<{
    id: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>;
  if (pis.length === 0) return null;
  const chosen = pis.find((p) => p.status === "completed") ?? pis[0];

  // 4) réponses.
  const { data: rRows } = await admin
    .from("pre_interview_responses")
    .select("question_id, answer_text, answer_choices, answer_scale")
    .eq("pre_interview_id", chosen.id);
  const responses = (rRows ?? []) as Array<{
    question_id: string;
    answer_text: string | null;
    answer_choices: string[] | null;
    answer_scale: number | null;
  }>;
  if (responses.length === 0) {
    return { preInterviewId: chosen.id, status: chosen.status, completedAt: chosen.completed_at, answers: [] };
  }

  // 5) questions par id (prompt/kind/choices/sort_order).
  const qIds = Array.from(new Set(responses.map((r) => r.question_id)));
  const { data: qRows } = await admin
    .from("pre_interview_questions")
    .select("id, prompt, kind, choices, sort_order")
    .in("id", qIds);
  const qById = new Map<
    string,
    { prompt: string; kind: PreInterviewQuestionKind; choices: PreInterviewQuestionChoice[] | null; sort_order: number }
  >();
  for (const q of (qRows ?? []) as Array<{
    id: string;
    prompt: string;
    kind: PreInterviewQuestionKind;
    choices: PreInterviewQuestionChoice[] | null;
    sort_order: number;
  }>) {
    qById.set(q.id, { prompt: q.prompt, kind: q.kind, choices: q.choices, sort_order: q.sort_order });
  }

  const answers: OnboardingAnswer[] = responses
    .map((r) => {
      const q = qById.get(r.question_id);
      const choices = q?.choices ?? [];
      const labelOf = (val: string) =>
        choices.find((c) => c.value === val)?.label ?? val;
      return {
        questionId: r.question_id,
        prompt: q?.prompt ?? "(question supprimée)",
        kind: (q?.kind ?? "text") as PreInterviewQuestionKind,
        sortOrder: q?.sort_order ?? 9999,
        answerText: r.answer_text,
        answerChoices: r.answer_choices,
        answerScale: r.answer_scale,
        choiceLabels: Array.isArray(r.answer_choices) ? r.answer_choices.map(labelOf) : [],
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    preInterviewId: chosen.id,
    status: chosen.status,
    completedAt: chosen.completed_at,
    answers,
  };
}
