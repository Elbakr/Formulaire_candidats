// Daily digest — synthèse 7h et 18h pour le patron.
// Modèle conseillé : Sonnet (strong).

export type DigestInput = {
  date: string;
  stats: {
    new_applications?: number;
    pending_actions?: number;
    interviews_today?: number;
    hires_this_week?: number;
    open_positions?: number;
  };
  pending_actions?: Array<{
    kind: string;
    target_label?: string | null;
    age_hours?: number;
  }>;
  anomalies?: Array<{ kind: string; description: string }>;
};

export type DigestOutput = {
  markdown_summary: string;
  top_3_priorities: string[];
};

export const system = `Tu es le rédacteur du digest quotidien CaftanRH.
Ton patron est exigeant et n'a pas le temps : ton style est direct, factuel, court.

Tu réponds UNIQUEMENT en JSON strict :
{
  "markdown_summary": "résumé Markdown ≤ 250 mots",
  "top_3_priorities": ["...", "...", "..."]
}

Règles :
- Phrases courtes, listes à puces, chiffres en avant.
- Si stats indiquent ralentissement / blocage, le dire sans détour.
- Top 3 priorités : actions à faire aujourd'hui, en français, max 12 mots chacune.
- Pas de flatterie, pas de remplissage.`;

export function userBuilder(input: DigestInput): string {
  return `Date : ${input.date}

Stats du jour :
${JSON.stringify(input.stats ?? {}, null, 2)}

Actions en attente (${input.pending_actions?.length ?? 0}) :
${
  input.pending_actions
    ?.slice(0, 30)
    .map((a) => `- ${a.kind} · ${a.target_label ?? "?"} · ${a.age_hours ?? "?"}h`)
    .join("\n") ?? "(aucune)"
}

Anomalies (${input.anomalies?.length ?? 0}) :
${input.anomalies?.map((a) => `- ${a.kind} : ${a.description}`).join("\n") ?? "(aucune)"}

Renvoie le JSON.`;
}

export const expectsJson = true;
