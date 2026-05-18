/**
 * Score 0-100 calculé depuis les réponses au pré-entretien.
 * Karim 18/05 : "vérifier que les réponses sont prises en compte par notre
 * système intelligent pour classer le candidat et aider la décision RH".
 *
 * Barème (sur 100 pts) :
 *  - Disponibilité immédiate (Q40 slug 'all_40_..._disponibilite') : 25 pts
 *  - Mobilité entre boutiques (Q50)                                : 20 pts
 *  - Canaux de communication acceptés (Q70 multi)                  : 10 pts
 *  - Qualité textes ouverts (Q10/Q20/Q30/Q60 longueur)             : 25 pts
 *  - Vidéos enregistrées (Q200/Q210/Q220)                          : 15 pts
 *  - Bonus engagement (a rempli les facultatifs)                   : 5 pts
 *
 * Si pas de pre-interview completed → null (pas pénalisant, juste absent).
 */

export type PreInterviewResponseForScoring = {
  question_sort_order: number;
  question_kind: "text" | "scale_1_5" | "single_choice" | "multi_choice" | "video";
  answer_text: string | null;
  answer_choices: string[] | null;
  answer_scale: number | null;
  video_storage_path: string | null;
};

export type PreInterviewScoreBreakdown = {
  availability: number;            // 0-25 (Q40)
  mobility: number;                // 0-20 (Q50)
  communication: number;           // 0-10 (Q70)
  text_quality: number;            // 0-25 (Q10/Q20/Q30/Q60)
  videos: number;                  // 0-15 (Q200/Q210/Q220)
  engagement: number;              // 0-5 (facultatifs remplis)
  availability_label: string;
  mobility_label: string;
  channels_count: number;
  videos_count: number;
};

function availabilityScore(choices: string[] | null): { score: number; label: string } {
  const v = choices?.[0];
  if (v === "immediat") return { score: 25, label: "Immédiat (top)" };
  if (v === "1_2_sem") return { score: 20, label: "1-2 semaines" };
  if (v === "1_mois") return { score: 12, label: "1 mois" };
  if (v === "plus_tard") return { score: 5, label: "Plus tard" };
  return { score: 0, label: "Non renseigné" };
}

function mobilityScore(choices: string[] | null): { score: number; label: string } {
  const v = choices?.[0];
  if (v === "oui_toutes") return { score: 20, label: "Toutes les boutiques" };
  if (v === "oui_certaines") return { score: 12, label: "Certaines uniquement" };
  if (v === "non") return { score: 4, label: "Un seul lieu" };
  return { score: 0, label: "Non renseigné" };
}

function communicationScore(choices: string[] | null): { score: number; count: number } {
  const arr = Array.isArray(choices) ? choices : [];
  // 4 pts par canal coché (3 max = 12), capé à 10.
  return { score: Math.min(10, arr.length * 4), count: arr.length };
}

function textQualityScore(responses: PreInterviewResponseForScoring[]): number {
  // 4 questions text obligatoires (Q10, Q20, Q30, Q60). 6 pts max par question.
  // Critère : > 50 chars = 4 pts (effort de qualité), > 150 chars = 6 pts (détaillé).
  // Q60 (situation) court par nature, on tolère 20 chars.
  const tQuestions = [
    { sortOrder: 10, threshold: 50, deep: 150 },
    { sortOrder: 20, threshold: 50, deep: 150 },
    { sortOrder: 30, threshold: 30, deep: 100 },
    { sortOrder: 60, threshold: 20, deep: 80 },
  ];
  let total = 0;
  for (const t of tQuestions) {
    const r = responses.find((x) => x.question_sort_order === t.sortOrder);
    const len = (r?.answer_text ?? "").trim().length;
    if (len >= t.deep) total += 6;
    else if (len >= t.threshold) total += 4;
    else if (len > 0) total += 2;
  }
  // Cap a 25 (4*6=24 max, +1 si la moyenne est tres elevee)
  return Math.min(25, total);
}

function videosScore(responses: PreInterviewResponseForScoring[]): { score: number; count: number } {
  let count = 0;
  for (const r of responses) {
    if (r.question_kind === "video" && r.video_storage_path && r.video_storage_path.length > 0) {
      count += 1;
    }
  }
  // 5 pts par vidéo, max 15 (3 vidéos)
  return { score: Math.min(15, count * 5), count };
}

function engagementBonus(responses: PreInterviewResponseForScoring[]): number {
  // Q45 (date précise facultative) et Q70 (communication facultative) remplis = +5
  const q45 = responses.find((x) => x.question_sort_order === 45);
  const q70 = responses.find((x) => x.question_sort_order === 70);
  const q45Done = !!q45?.answer_text?.trim();
  const q70Done = Array.isArray(q70?.answer_choices) && q70.answer_choices.length > 0;
  let pts = 0;
  if (q45Done) pts += 2;
  if (q70Done) pts += 3;
  return pts;
}

export function computePreInterviewScore(
  responses: PreInterviewResponseForScoring[],
): { score: number; breakdown: PreInterviewScoreBreakdown } {
  const avail = availabilityScore(
    responses.find((r) => r.question_sort_order === 40)?.answer_choices ?? null,
  );
  const mob = mobilityScore(
    responses.find((r) => r.question_sort_order === 50)?.answer_choices ?? null,
  );
  const comm = communicationScore(
    responses.find((r) => r.question_sort_order === 70)?.answer_choices ?? null,
  );
  const txt = textQualityScore(responses);
  const vid = videosScore(responses);
  const eng = engagementBonus(responses);
  const score = avail.score + mob.score + comm.score + txt + vid.score + eng;
  return {
    score: Math.min(100, score),
    breakdown: {
      availability: avail.score,
      mobility: mob.score,
      communication: comm.score,
      text_quality: txt,
      videos: vid.score,
      engagement: eng,
      availability_label: avail.label,
      mobility_label: mob.label,
      channels_count: comm.count,
      videos_count: vid.count,
    },
  };
}
