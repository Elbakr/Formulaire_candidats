// Karim 2026-05-31 : moteur de calcul score screening candidat.
//
// Pour chaque question :
//   - single_choice/yes_no : score = option.score × weight
//   - scale (1-5) : score = (value-1)/4 × maxScore × weight
//   - numeric : si correct ± tolerance => score plein × weight, sinon 0
//   - multi_choice : sum scores des options choisies × weight
//   - text_short : pas de score auto (review RH)
//
// Total = Σ scores obtenus / Σ scores max possibles × 100
// Recommendation :
//   - any red flag triggered → PASS
//   - score >= min_score_to_hire (default 65) → HIRE
//   - score >= min - 10 → MAYBE
//   - sinon → PASS

export interface QuestionOption {
  value?: string | number;
  label?: string;
  score?: number;
  redFlag?: boolean;
  correct?: number;
  tolerance?: number;
  min?: number;
  max?: number;
  labels?: [string, string];
}

export interface ScreeningQuestion {
  id: string;
  category: string;
  question_text: string;
  question_subtitle: string | null;
  type: "single_choice" | "multi_choice" | "scale" | "numeric" | "text_short" | "yes_no" | "date_array";
  options: QuestionOption[];
  weight: number;
  is_required: boolean;
  is_red_flag_question: boolean;
}

export interface ScreeningAnswerInput {
  question_id: string;
  value_text?: string | null;
  value_num?: number | null;
  value_array?: unknown[] | null;
}

export interface ScoredAnswer {
  question_id: string;
  score_obtained: number;
  score_max_possible: number;
  is_red_flag_triggered: boolean;
}

/**
 * Calcule le score d UNE réponse individuelle.
 */
export function scoreAnswer(
  question: ScreeningQuestion,
  answer: ScreeningAnswerInput,
): ScoredAnswer {
  const w = Number(question.weight ?? 1);
  let scoreObtained = 0;
  let scoreMaxPossible = 10 * w; // baseline: chaque question vaut au max 10 points × weight
  let redFlag = false;

  switch (question.type) {
    case "single_choice":
    case "yes_no": {
      const sel = question.options.find((o) => String(o.value) === answer.value_text);
      if (sel) {
        scoreObtained = Number(sel.score ?? 0) * w;
        if (sel.redFlag) redFlag = true;
      }
      // score max = max parmi tous les options
      const max = Math.max(...question.options.map((o) => Number(o.score ?? 0)), 10);
      scoreMaxPossible = max * w;
      break;
    }
    case "multi_choice": {
      const values = (answer.value_array ?? []) as string[];
      let total = 0;
      for (const v of values) {
        const opt = question.options.find((o) => String(o.value) === String(v));
        if (opt) {
          total += Number(opt.score ?? 0);
          if (opt.redFlag) redFlag = true;
        }
      }
      scoreObtained = total * w;
      const maxSum = question.options.reduce((s, o) => s + Math.max(0, Number(o.score ?? 0)), 0);
      scoreMaxPossible = maxSum * w;
      break;
    }
    case "scale": {
      const v = Number(answer.value_num ?? 0);
      const opt = question.options[0] ?? {};
      const min = Number(opt.min ?? 1);
      const max = Number(opt.max ?? 5);
      if (v >= min && v <= max) {
        const normalized = (v - min) / (max - min); // 0..1
        scoreObtained = normalized * 10 * w;
      }
      scoreMaxPossible = 10 * w;
      break;
    }
    case "numeric": {
      const v = Number(answer.value_num ?? NaN);
      const opt = question.options[0] ?? {};
      const correct = Number(opt.correct ?? NaN);
      const tolerance = Number(opt.tolerance ?? 0);
      const fullScore = Number(opt.score ?? 10);
      if (Number.isFinite(v) && Number.isFinite(correct) && Math.abs(v - correct) <= tolerance) {
        scoreObtained = fullScore * w;
      }
      scoreMaxPossible = fullScore * w;
      break;
    }
    case "text_short": {
      // Pas de score auto, RH valide. Score nul mais max_possible = 0 pour ne pas penaliser
      scoreObtained = 0;
      scoreMaxPossible = 0;
      break;
    }
    case "date_array": {
      // Pas de score auto
      scoreObtained = 0;
      scoreMaxPossible = 0;
      break;
    }
  }

  return {
    question_id: question.id,
    score_obtained: Math.max(0, scoreObtained),
    score_max_possible: scoreMaxPossible,
    is_red_flag_triggered: redFlag,
  };
}

/**
 * Calcule le score TOTAL + breakdown par catégorie + recommandation.
 */
export function computeFinalScore(
  questions: ScreeningQuestion[],
  scoredAnswers: ScoredAnswer[],
  minScoreToHire = 65,
): {
  totalScore: number;
  categoryScores: Record<string, number>;
  hasRedFlag: boolean;
  recommendation: "HIRE" | "MAYBE" | "PASS";
} {
  const byCategory = new Map<string, { obtained: number; max: number }>();
  let totalObtained = 0;
  let totalMax = 0;
  let hasRedFlag = false;
  const qById = new Map(questions.map((q) => [q.id, q]));

  for (const a of scoredAnswers) {
    const q = qById.get(a.question_id);
    if (!q) continue;
    const cat = q.category;
    if (!byCategory.has(cat)) byCategory.set(cat, { obtained: 0, max: 0 });
    const c = byCategory.get(cat)!;
    c.obtained += a.score_obtained;
    c.max += a.score_max_possible;
    totalObtained += a.score_obtained;
    totalMax += a.score_max_possible;
    if (a.is_red_flag_triggered) hasRedFlag = true;
  }

  const totalScore = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
  const categoryScores: Record<string, number> = {};
  for (const [cat, c] of byCategory.entries()) {
    categoryScores[cat] = c.max > 0 ? Math.round((c.obtained / c.max) * 10000) / 100 : 0;
  }

  let recommendation: "HIRE" | "MAYBE" | "PASS";
  if (hasRedFlag) recommendation = "PASS";
  else if (totalScore >= minScoreToHire) recommendation = "HIRE";
  else if (totalScore >= minScoreToHire - 10) recommendation = "MAYBE";
  else recommendation = "PASS";

  return { totalScore, categoryScores, hasRedFlag, recommendation };
}

/**
 * Labels lisibles des catégories.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  math: "🧮 Math / Caisse",
  client: "🤝 Clientèle",
  ethics: "⚖️ Valeurs & Éthique",
  personality: "🧠 Personnalité",
  seriousness: "🎯 Sérieux & Engagement",
  lang_fr: "🇫🇷 Français",
  lang_ar: "🇦🇪 Chiffres arabe",
  lang_en: "🇬🇧 Anglais",
  punctuality: "⏰ Ponctualité",
  availability: "📅 Disponibilité",
};
