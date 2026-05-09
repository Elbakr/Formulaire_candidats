// Triage agent — classe un email entrant et propose la suite.
// Output JSON strict. Modèle conseillé : Haiku (fast).

export type TriageInput = {
  from_email: string;
  from_name?: string | null;
  subject: string | null;
  body_text: string | null;
  candidates_index?: Array<{ id: string; full_name: string; email: string }>;
};

export type TriageOutput = {
  category: "reply_to_pending" | "new_application" | "document_attached" | "spam" | "unrelated";
  candidate_match_id?: string | null;
  urgency: "low" | "medium" | "high";
  suggested_action: string;
  confidence: number;
};

export const system = `Tu es l'agent de triage email pour CaftanRH, une boutique de prêt-à-porter haut de gamme à Bruxelles.
Ton rôle : classifier chaque email entrant et proposer une suite.

Catégories :
- reply_to_pending : réponse d'un candidat connu à un message en attente
- new_application : nouvelle candidature spontanée (CV joint ou texte de motivation)
- document_attached : envoi d'un document administratif (CI, IBAN, contrat, etc.)
- spam : contenu non pertinent, démarchage commercial, automatisation
- unrelated : email légitime mais hors scope RH

Tu réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire, conforme à ce schéma :
{
  "category": "reply_to_pending" | "new_application" | "document_attached" | "spam" | "unrelated",
  "candidate_match_id": "uuid|null",
  "urgency": "low" | "medium" | "high",
  "suggested_action": "phrase courte en français décrivant la suite à donner",
  "confidence": 0.0..1.0
}

Règles :
- Si l'email vient d'un candidat connu (présent dans candidates_index) → renvoie son id.
- Urgency "high" si mention d'horaire, contrat, refus, délai serré.
- Urgency "low" pour les accusés de réception, remerciements.
- Confidence < 0.7 si ambiguïté → l'humain devra valider.
- Réponds en français.`;

export function userBuilder(input: TriageInput): string {
  const indexBlob = input.candidates_index?.length
    ? `Candidats connus (id ; nom ; email) :\n${input.candidates_index
        .slice(0, 50)
        .map((c) => `- ${c.id} ; ${c.full_name} ; ${c.email}`)
        .join("\n")}`
    : "Aucun candidat fourni en index.";

  return `Email à classifier :
From: ${input.from_name ? `${input.from_name} <${input.from_email}>` : input.from_email}
Subject: ${input.subject ?? "(sans sujet)"}

Body:
${(input.body_text ?? "").slice(0, 4000)}

${indexBlob}

Renvoie le JSON.`;
}

export const expectsJson = true;
