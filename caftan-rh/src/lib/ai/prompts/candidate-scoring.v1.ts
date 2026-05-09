// Candidate scoring — produit un fit_0_100 + forces / lacunes / prochaine étape suggérée.
// Modèle conseillé : Sonnet (strong).

export type CandidateScoringInput = {
  candidate: {
    full_name: string;
    email?: string | null;
    city?: string | null;
    source?: string | null;
  };
  job?: {
    title: string;
    description?: string | null;
    contract_type?: string | null;
    location?: string | null;
  } | null;
  motivation_text?: string | null;
  cv_url?: string | null;
};

export type CandidateScoringOutput = {
  fit_0_100: number;
  strengths: string[];
  gaps: string[];
  suggested_next_stage: "contacted" | "rdv_scheduled" | "wait_decision" | "refused";
  justification: string;
};

export const system = `Tu es l'agent de scoring CaftanRH (boutique prêt-à-porter haut de gamme, Bruxelles).
Tu évalues l'adéquation candidat / poste sur des critères :
- expérience retail / mode (atout fort)
- soft skills (relationnel client, présentation, langues FR/NL/EN)
- proximité géographique (Bruxelles, BW, Hainaut)
- motivation perceptible dans le texte fourni
- cohérence parcours / contrat (étudiant, CDI, CDD)

Réponds UNIQUEMENT en JSON strict :
{
  "fit_0_100": 0..100,
  "strengths": ["..."],
  "gaps": ["..."],
  "suggested_next_stage": "contacted" | "rdv_scheduled" | "wait_decision" | "refused",
  "justification": "max 2-3 phrases en français"
}

Règles :
- fit < 30 → suggested_next_stage = "refused"
- fit 30-55 → "wait_decision"
- fit 55-75 → "contacted"
- fit > 75 → "rdv_scheduled"
- Sois honnête et bref. Pas de flatterie.
- Si l'info manque, signale-le dans gaps.`;

export function userBuilder(input: CandidateScoringInput): string {
  const job = input.job
    ? `Poste cible :
- Titre : ${input.job.title}
- Contrat : ${input.job.contract_type ?? "?"}
- Lieu : ${input.job.location ?? "?"}
- Description : ${(input.job.description ?? "").slice(0, 1500)}`
    : "Candidature spontanée (pas de poste précis).";

  return `Candidat :
- Nom : ${input.candidate.full_name}
- Ville : ${input.candidate.city ?? "?"}
- Source : ${input.candidate.source ?? "?"}

${job}

Motivation / texte fourni :
${(input.motivation_text ?? "(aucune)").slice(0, 3000)}

CV : ${input.cv_url ?? "(non fourni)"}

Renvoie le JSON.`;
}

export const expectsJson = true;
