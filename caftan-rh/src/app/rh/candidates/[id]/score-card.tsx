// Carte "Score IA candidat" affichée sur la fiche candidat.
// Calcul côté serveur via computeCandidateScoreDetailed.

import { Card } from "@/components/ui/card";
import { computeCandidateScoreDetailed, SCORE_MAX, type CandidateScored } from "@/lib/candidate-scoring";

const AXES: Array<[keyof typeof SCORE_MAX, string]> = [
  ["profile", "Complétude profil"],
  ["motivation", "Motivation"],
  ["availability", "Disponibilité"],
  ["languages", "Langues"],
  ["cv", "CV"],
  ["experience", "Expérience (âge)"],
  ["urgency", "Urgence"],
  ["distance", "Distance domicile"],
];

export function CandidateScoreCard({
  candidate,
  closestSiteCode,
}: {
  candidate: CandidateScored;
  closestSiteCode?: string | null;
}) {
  const { total, breakdown, recommendation } = computeCandidateScoreDetailed(candidate);
  const distKm = candidate.closest_site_distance_km;
  const distLine =
    distKm == null
      ? "Distance domicile : non disponible (postcode manquant ou inconnu)."
      : `Distance domicile : ${distKm.toFixed(1)} km du magasin le plus proche${
          closestSiteCode ? ` (Site ${closestSiteCode})` : ""
        }.`;

  const toneCls =
    recommendation.tone === "good"
      ? "bg-success-light text-success"
      : recommendation.tone === "ok"
        ? "bg-gold-light text-gold-dark"
        : recommendation.tone === "warn"
          ? "bg-warn-light text-warn"
          : "bg-danger-light text-danger";

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center gap-3">
        <div>
          <h2 className="font-bold text-sm">Score IA candidat</h2>
          <p className="text-xs text-ink-3">7 sous-scores, calculs heuristiques.</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Score</div>
          <div className="text-3xl font-extrabold font-mono text-gold-dark">{total}<span className="text-base text-ink-3 font-normal">/100</span></div>
        </div>
      </div>
      <div className={`p-3 text-xs font-semibold ${toneCls}`}>
        {recommendation.label} — <span className="font-normal">{recommendation.detail}</span>
      </div>
      <div className="px-4 py-2 text-[11px] text-ink-2 border-b border-line bg-surface-2">
        {distLine}
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AXES.map(([k, label]) => {
          const v = breakdown[k];
          const max = SCORE_MAX[k];
          const pct = max > 0 ? Math.round((v / max) * 100) : 0;
          return (
            <div key={k}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold">{label}</span>
                <span className="font-mono font-bold">{v} / {max}</span>
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden">
                <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
