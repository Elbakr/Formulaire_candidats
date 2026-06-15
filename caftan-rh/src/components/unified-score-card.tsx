"use client";

/**
 * UnifiedScoreCard — Caftan HR
 *
 * Carte de présentation du score unifié candidat (côté RH).
 * Composant de présentation pure : toutes les données arrivent en props.
 * Ne brancher nulle part — le Tech Lead se charge de l'intégration.
 *
 * Props = résultat de computeUnifiedScore() (unified-candidate-score.ts).
 * Thème : clair uniquement (jamais de dark:).
 */

import type { UnifiedCandidateScore } from "@/lib/scoring/unified-candidate-score";

// ─── Couleurs par recommandation ───────────────────────────────────────────────

const RECO_CONFIG = {
  HIRE: {
    bg:          "bg-green-50",
    border:      "border-green-400",
    badge:       "bg-green-100 text-green-800",
    ring:        "ring-green-400",
    label:       "Recommandé",
    scoreColor:  "text-green-700",
  },
  MAYBE: {
    bg:          "bg-yellow-50",
    border:      "border-yellow-400",
    badge:       "bg-yellow-100 text-yellow-800",
    ring:        "ring-yellow-400",
    label:       "À évaluer",
    scoreColor:  "text-yellow-700",
  },
  PASS: {
    bg:          "bg-red-50",
    border:      "border-red-400",
    badge:       "bg-red-100 text-red-800",
    ring:        "ring-red-400",
    label:       "Non retenu",
    scoreColor:  "text-red-700",
  },
} as const;

// ─── Composant principal ───────────────────────────────────────────────────────

type Props = {
  /** Résultat de computeUnifiedScore(). */
  result: UnifiedCandidateScore;
  /** Nom complet du candidat (affiché en en-tête). */
  candidateName?: string;
};

export function UnifiedScoreCard({ result, candidateName }: Props) {
  const cfg = RECO_CONFIG[result.recommendation];
  const bd  = result.breakdown;

  return (
    <div
      className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-5 space-y-4 shadow-sm`}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {candidateName && (
            <p className="text-xs font-medium text-gray-500 mb-0.5 uppercase tracking-wide">
              Candidat
            </p>
          )}
          {candidateName && (
            <p className="text-base font-semibold text-gray-900">{candidateName}</p>
          )}
        </div>

        {/* Badge recommandation */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${cfg.badge}`}
        >
          {result.recommendation === "HIRE"  && "✓ "}
          {result.recommendation === "MAYBE" && "~ "}
          {result.recommendation === "PASS"  && "✕ "}
          {cfg.label}
        </span>
      </div>

      {/* Score en grand */}
      <div className="flex items-end gap-2">
        <span className={`text-5xl font-extrabold leading-none ${cfg.scoreColor}`}>
          {result.score}
        </span>
        <span className="text-xl text-gray-400 font-light mb-1">/ 100</span>
      </div>

      {/* Barre de progression */}
      <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            result.recommendation === "HIRE"
              ? "bg-green-500"
              : result.recommendation === "MAYBE"
              ? "bg-yellow-500"
              : "bg-red-500"
          }`}
          style={{ width: `${result.score}%` }}
        />
      </div>

      {/* Détail des composantes */}
      <div className="grid grid-cols-2 gap-2">
        <ScoreChip
          label="Screening"
          score={bd.screeningScore}
          weight={bd.screeningWeight}
          hasRedFlag={bd.hasRedFlag}
        />
        {bd.preInterviewScore !== null ? (
          <ScoreChip
            label="Pré-entretien"
            score={bd.preInterviewScore}
            weight={bd.preInterviewWeight}
          />
        ) : (
          <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-center">
            <p className="text-xs text-gray-400 font-medium">Pré-entretien</p>
            <p className="text-sm text-gray-400 italic mt-0.5">Non complété</p>
          </div>
        )}
      </div>

      {/* Détail pré-entretien si disponible */}
      {bd.preInterviewBreakdown && (
        <PreInterviewDetail breakdown={bd.preInterviewBreakdown} />
      )}

      {/* Explication */}
      <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Explication
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{result.explanation}</p>
      </div>

      {/* Alerte red flag */}
      {bd.hasRedFlag && (
        <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 flex items-start gap-2">
          <span className="text-red-500 text-base leading-tight mt-0.5">⚠</span>
          <p className="text-sm text-red-700 font-medium">
            Red flag déclenché lors du screening — vérification RH obligatoire.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

type ScoreChipProps = {
  label: string;
  score: number;
  weight: number;
  hasRedFlag?: boolean;
};

function ScoreChip({ label, score, weight, hasRedFlag }: ScoreChipProps) {
  const pct = Math.round(weight * 100);
  return (
    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-center">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-800 mt-0.5">
        {Math.round(score)}
        <span className="text-xs font-normal text-gray-400">/100</span>
      </p>
      <p className="text-xs text-gray-400">pondération {pct}%</p>
      {hasRedFlag && (
        <p className="text-xs text-red-600 font-semibold mt-0.5">⚠ Red flag</p>
      )}
    </div>
  );
}

type PreInterviewDetailProps = {
  breakdown: NonNullable<UnifiedCandidateScore["breakdown"]["preInterviewBreakdown"]>;
};

function PreInterviewDetail({ breakdown: bd }: PreInterviewDetailProps) {
  const items: { label: string; value: string }[] = [
    { label: "Disponibilité",    value: `${bd.availability_label} (${bd.availability}/25)` },
    { label: "Mobilité",         value: `${bd.mobility_label} (${bd.mobility}/20)` },
    { label: "Communication",    value: `${bd.channels_count} canal(x) (${bd.communication}/10)` },
    { label: "Qualité textes",   value: `${bd.text_quality}/25` },
    { label: "Vidéos",           value: `${bd.videos_count} vidéo(s) (${bd.videos}/15)` },
    { label: "Engagement bonus", value: `${bd.engagement}/5` },
  ];

  return (
    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Détail pré-entretien
      </p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.label} className="flex justify-between text-sm">
            <span className="text-gray-600">{it.label}</span>
            <span className="text-gray-800 font-medium">{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
