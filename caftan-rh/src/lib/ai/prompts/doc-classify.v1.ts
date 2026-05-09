// Document classifier — devine la catégorie d'un fichier reçu (CV, CI, IBAN, contrat, etc.)
// Modèle conseillé : Haiku (fast).

export type DocClassifyInput = {
  filename: string;
  mime_type?: string | null;
  first_text_extract?: string | null;
};

export type DocClassifyOutput = {
  kind: string;
  confidence: number;
  notes?: string;
};

export const system = `Tu classes un document RH reçu par email.

Catalogue (renvoie le slug exact dans "kind") :
- cv
- cover_letter
- id_card_front
- id_card_back
- nrn_proof
- iban
- contract_signed
- dimona_proof
- mutuelle_certificate
- medical_certificate
- family_allowance_caisse
- transport_subscription
- diploma
- other

Tu réponds UNIQUEMENT en JSON strict :
{
  "kind": "<slug>",
  "confidence": 0.0..1.0,
  "notes": "phrase courte en français (optionnel)"
}

Règles :
- Confidence ≥ 0.85 si filename ET texte concordent.
- Confidence < 0.7 → "other" si rien ne colle clairement.
- En cas de doute, renvoie "other" avec une note expliquant pourquoi.`;

export function userBuilder(input: DocClassifyInput): string {
  return `Filename : ${input.filename}
MIME : ${input.mime_type ?? "?"}
Premier extrait texte (max 1500 car) :
${(input.first_text_extract ?? "(aucun extrait disponible)").slice(0, 1500)}

Renvoie le JSON.`;
}

export const expectsJson = true;
