// Types partagés client/server pour le module Pré-entretien (V1 écrit)
// Pas d'import server ici — utilisable depuis tous les composants client.

export type PreInterviewQuestionKind =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "scale_1_5"
  | "video";

export type PreInterviewQuestionChoice = {
  value: string;
  label: string;
};

export type PreInterviewQuestion = {
  id: string;
  slug: string;
  position_role: string;
  language_code: string;
  prompt: string;
  kind: PreInterviewQuestionKind;
  choices: PreInterviewQuestionChoice[] | null;
  min_chars: number;
  max_chars: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  /** Durée max pour les questions kind='video' (sec). Null/undefined pour les autres types. */
  video_max_seconds?: number | null;
};

/** Nom du bucket Supabase Storage privé hébergeant les réponses vidéo. */
export const PRE_INTERVIEW_VIDEO_BUCKET = "pre-interview-videos";

/** Combien de jours après la décision RH on purge les vidéos (RGPD). */
export const PRE_INTERVIEW_VIDEO_PURGE_DAYS = 30;

export type PreInterviewStatus =
  | "sent"
  | "started"
  | "completed"
  | "expired"
  | "discarded";

export type PreInterviewDecision = "shortlist" | "reject" | "reserve";

export type PreInterview = {
  id: string;
  application_id: string;
  position_role: string;
  token: string;
  language_code: string;
  sent_at: string | null;
  expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: PreInterviewStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  decision: PreInterviewDecision | null;
  decision_note: string | null;
  created_at: string;
};

export type PreInterviewResponse = {
  id: string;
  pre_interview_id: string;
  question_id: string;
  answer_text: string | null;
  answer_choices: string[] | null;
  answer_scale: number | null;
  answered_at: string;
  /** Path Supabase Storage de la vidéo (bucket pre-interview-videos), si question vidéo. */
  video_storage_path?: string | null;
  /** Durée effective enregistrée (sec). */
  video_duration_sec?: number | null;
  /** Fixé à decision_at + 30 jours par markPreInterviewDecisionAction. */
  video_purge_after?: string | null;
};

export type PreInterviewWithResponses = {
  preInterview: PreInterview;
  questions: PreInterviewQuestion[];
  responses: PreInterviewResponse[];
};

export const POSITION_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tous postes (générique)" },
  { value: "vendeur", label: "Vendeur / Vendeuse" },
  { value: "gerant", label: "Gérant(e) de boutique" },
  { value: "gestionnaire", label: "Gestionnaire / Back-office" },
];

export const PRE_INTERVIEW_DURATION_DAYS = 5;

export function isPreInterviewExpired(pi: PreInterview): boolean {
  if (!pi.expires_at) return false;
  if (pi.status === "completed" || pi.status === "discarded") return false;
  return new Date(pi.expires_at).getTime() < Date.now();
}

export function preInterviewProgress(
  questions: PreInterviewQuestion[],
  responses: PreInterviewResponse[],
): { answered: number; total: number; pct: number } {
  const required = questions.filter((q) => q.is_required);
  const answeredIds = new Set(
    responses
      .filter((r) => {
        const hasText = (r.answer_text ?? "").trim().length > 0;
        const hasChoices = Array.isArray(r.answer_choices) && r.answer_choices.length > 0;
        const hasScale = typeof r.answer_scale === "number";
        const hasVideo = !!(r.video_storage_path && r.video_storage_path.trim().length > 0);
        return hasText || hasChoices || hasScale || hasVideo;
      })
      .map((r) => r.question_id),
  );
  const answered = required.filter((q) => answeredIds.has(q.id)).length;
  const total = required.length;
  return {
    answered,
    total,
    pct: total === 0 ? 0 : Math.round((answered / total) * 100),
  };
}
