/**
 * Score unifié candidat — Caftan HR
 *
 * Combine le score de screening (computeFinalScore) et le score de
 * pré-entretien (computePreInterviewScore) en un seul résultat 0-100
 * avec une recommandation explicable.
 *
 * Pondération par défaut (ajustable via les constantes ci-dessous) :
 *   - Screening    : 60 %
 *   - Pré-entretien : 40 %
 *
 * Règle absolue : un red-flag screening force la recommandation à PASS,
 * quelle que soit la note du pré-entretien.
 */

// ─── Constantes ajustables ────────────────────────────────────────────────────

/** Part du score screening dans le calcul final (0-1). */
export const WEIGHT_SCREENING = 0.6;

/** Part du score pré-entretien dans le calcul final (0-1). */
export const WEIGHT_PRE_INTERVIEW = 0.4;

/** Score total minimum pour obtenir HIRE (sur 100). */
export const MIN_SCORE_HIRE = 65;

/** Écart en dessous de MIN_SCORE_HIRE toléré pour MAYBE. */
export const MAYBE_MARGIN = 10;

// ─── Types d'entrée (miroir des structures sources, sans réimporter les detils) ─

/**
 * Résultat brut de computeFinalScore (screening-scoring.ts).
 * On accepte le sous-ensemble utile pour éviter de coupler toute la structure.
 */
export type ScreeningResult = {
  totalScore: number;                      // 0-100
  categoryScores: Record<string, number>;  // par catégorie, 0-100
  hasRedFlag: boolean;
  recommendation: "HIRE" | "MAYBE" | "PASS";
};

/**
 * Résultat brut de computePreInterviewScore (scoring/pre-interview-score.ts).
 * null si le pré-entretien n'a pas encore été complété.
 */
export type PreInterviewResult = {
  score: number;   // 0-100
  breakdown: {
    availability: number;
    mobility: number;
    communication: number;
    text_quality: number;
    videos: number;
    engagement: number;
    availability_label: string;
    mobility_label: string;
    channels_count: number;
    videos_count: number;
  };
} | null;

// ─── Type de sortie ────────────────────────────────────────────────────────────

export type UnifiedScoreBreakdown = {
  /** Score screening (0-100) avant pondération. */
  screeningScore: number;
  /** Poids appliqué au screening dans le calcul. */
  screeningWeight: number;
  /** Score pré-entretien (0-100) avant pondération. null si absent. */
  preInterviewScore: number | null;
  /** Poids appliqué au pré-entretien dans le calcul. */
  preInterviewWeight: number;
  /** Un red-flag a-t-il été déclenché lors du screening ? */
  hasRedFlag: boolean;
  /** Détail du pré-entretien (propagé tel quel depuis la source). */
  preInterviewBreakdown: NonNullable<PreInterviewResult>["breakdown"] | null;
  /** Scores par catégorie de screening. */
  screeningCategoryScores: Record<string, number>;
};

export type UnifiedCandidateScore = {
  /** Score final pondéré, arrondi à l'entier le plus proche (0-100). */
  score: number;
  /** Recommandation globale. */
  recommendation: "HIRE" | "MAYBE" | "PASS";
  /** Détail des composantes utilisées pour le calcul. */
  breakdown: UnifiedScoreBreakdown;
  /**
   * Explication lisible en français de la recommandation.
   * Toujours basée sur des règles déterministes (pas d'IA).
   */
  explanation: string;
};

// ─── Fonction principale ───────────────────────────────────────────────────────

/**
 * Calcule le score unifié d'un candidat.
 *
 * @param screening  - Résultat de computeFinalScore()
 * @param preInterview - Résultat de computePreInterviewScore(), ou null si absent
 * @param options    - Surcharge optionnelle des constantes de pondération
 *
 * @returns UnifiedCandidateScore — score, recommandation, breakdown, explanation
 *
 * @example
 * ```ts
 * import { computeFinalScore, scoreAnswer } from "@/lib/screening-scoring";
 * import { computePreInterviewScore } from "@/lib/scoring/pre-interview-score";
 * import { computeUnifiedScore } from "@/lib/scoring/unified-candidate-score";
 *
 * const screeningResult = computeFinalScore(questions, scoredAnswers);
 * const preInterviewResult = computePreInterviewScore(responses);
 * const unified = computeUnifiedScore(screeningResult, preInterviewResult);
 * ```
 */
export function computeUnifiedScore(
  screening: ScreeningResult,
  preInterview: PreInterviewResult,
  options?: {
    weightScreening?: number;
    weightPreInterview?: number;
    minScoreHire?: number;
    maybeMargin?: number;
  },
): UnifiedCandidateScore {
  const wScreen = options?.weightScreening ?? WEIGHT_SCREENING;
  const wPre    = options?.weightPreInterview ?? WEIGHT_PRE_INTERVIEW;
  const minHire = options?.minScoreHire ?? MIN_SCORE_HIRE;
  const margin  = options?.maybeMargin ?? MAYBE_MARGIN;

  // ── Calcul du score pondéré ──────────────────────────────────────────────

  let score: number;
  let effectivePreWeight: number;
  let effectiveScreenWeight: number;

  if (preInterview === null) {
    // Pas de pré-entretien : on ramène tout le poids sur le screening.
    effectiveScreenWeight = 1;
    effectivePreWeight    = 0;
    score = Math.round(screening.totalScore);
  } else {
    // Les deux sources sont présentes : pondération normale.
    const total = wScreen + wPre;
    effectiveScreenWeight = wScreen / total;
    effectivePreWeight    = wPre    / total;
    score = Math.round(
      screening.totalScore * effectiveScreenWeight +
      preInterview.score   * effectivePreWeight,
    );
  }

  // Borner 0-100 au cas où.
  score = Math.max(0, Math.min(100, score));

  // ── Recommandation ──────────────────────────────────────────────────────

  let recommendation: "HIRE" | "MAYBE" | "PASS";

  if (screening.hasRedFlag) {
    recommendation = "PASS";
  } else if (score >= minHire) {
    recommendation = "HIRE";
  } else if (score >= minHire - margin) {
    recommendation = "MAYBE";
  } else {
    recommendation = "PASS";
  }

  // ── Explanation (FR, déterministe) ─────────────────────────────────────

  const explanation = buildExplanation({
    score,
    recommendation,
    screening,
    preInterview,
    effectiveScreenWeight,
    effectivePreWeight,
    minHire,
    margin,
  });

  // ── Résultat ────────────────────────────────────────────────────────────

  const breakdown: UnifiedScoreBreakdown = {
    screeningScore:         screening.totalScore,
    screeningWeight:        effectiveScreenWeight,
    preInterviewScore:      preInterview?.score ?? null,
    preInterviewWeight:     effectivePreWeight,
    hasRedFlag:             screening.hasRedFlag,
    preInterviewBreakdown:  preInterview?.breakdown ?? null,
    screeningCategoryScores: screening.categoryScores,
  };

  return { score, recommendation, breakdown, explanation };
}

// ─── Helpers internes ──────────────────────────────────────────────────────────

type ExplainArgs = {
  score: number;
  recommendation: "HIRE" | "MAYBE" | "PASS";
  screening: ScreeningResult;
  preInterview: PreInterviewResult;
  effectiveScreenWeight: number;
  effectivePreWeight: number;
  minHire: number;
  margin: number;
};

function buildExplanation(a: ExplainArgs): string {
  const parts: string[] = [];

  // 1. Contexte des sources disponibles
  if (a.preInterview === null) {
    parts.push(
      `Score basé uniquement sur le screening (pré-entretien non encore complété).`,
    );
  } else {
    const pctScreen = Math.round(a.effectiveScreenWeight * 100);
    const pctPre    = Math.round(a.effectivePreWeight    * 100);
    parts.push(
      `Score combiné : screening ${pctScreen} % (${a.screening.totalScore}/100) ` +
      `+ pré-entretien ${pctPre} % (${a.preInterview.score}/100).`,
    );
  }

  // 2. Score global
  parts.push(`Score unifié : ${a.score}/100.`);

  // 3. Cause principale de la recommandation
  if (a.screening.hasRedFlag) {
    parts.push(
      `⚠ Un ou plusieurs red flags ont été détectés lors du screening → ` +
      `PASS automatique, quelle que soit la note totale.`,
    );
  } else if (a.recommendation === "HIRE") {
    parts.push(
      `Score ≥ ${a.minHire} → candidat recommandé pour la suite du processus (HIRE).`,
    );
  } else if (a.recommendation === "MAYBE") {
    parts.push(
      `Score entre ${a.minHire - a.margin} et ${a.minHire - 1} → ` +
      `profil intermédiaire, à évaluer plus finement (MAYBE).`,
    );
  } else {
    parts.push(
      `Score < ${a.minHire - a.margin} → profil insuffisant pour ce poste (PASS).`,
    );
  }

  // 4. Points forts / faibles issus du pré-entretien (si disponible)
  if (a.preInterview) {
    const bd = a.preInterview.breakdown;
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (bd.availability >= 20) strengths.push(`disponibilité rapide (${bd.availability_label})`);
    else if (bd.availability <= 5) weaknesses.push(`disponibilité tardive (${bd.availability_label})`);

    if (bd.mobility >= 16) strengths.push(`mobilité multi-boutiques (${bd.mobility_label})`);
    else if (bd.mobility <= 4) weaknesses.push(`mobilité limitée (${bd.mobility_label})`);

    if (bd.videos_count >= 2) strengths.push(`${bd.videos_count} vidéo(s) enregistrée(s)`);
    if (bd.text_quality >= 20) strengths.push(`réponses texte détaillées`);
    else if (bd.text_quality <= 6) weaknesses.push(`réponses texte trop courtes`);

    if (strengths.length > 0) {
      parts.push(`Points forts : ${strengths.join(", ")}.`);
    }
    if (weaknesses.length > 0) {
      parts.push(`Points de vigilance : ${weaknesses.join(", ")}.`);
    }
  }

  return parts.join(" ");
}
