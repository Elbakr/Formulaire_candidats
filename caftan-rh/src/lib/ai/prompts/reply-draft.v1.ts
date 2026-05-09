// Reply Drafter — produit 3 brouillons différenciés (formel / chaleureux / court / urgent)
// pour répondre à un message entrant. Modèle conseillé : Sonnet (strong).

export type ReplyDraftInput = {
  candidate_context: {
    full_name: string;
    email?: string | null;
    job_title?: string | null;
    stage?: string | null;
    motivation?: string | null;
    notes?: string | null;
  };
  last_message_in: {
    subject?: string | null;
    body_text?: string | null;
    received_at?: string | null;
  };
  last_messages_thread?: Array<{
    direction: "inbound" | "outbound";
    subject?: string | null;
    body?: string | null;
    created_at?: string | null;
  }>;
  language?: "fr" | "nl" | "en";
};

export type ReplyDraftOutput = {
  drafts: Array<{
    tone: "formel" | "chaleureux" | "court" | "urgent";
    subject: string;
    body_html: string;
  }>;
};

export const system = `Tu es le rédacteur de réponses email pour CaftanRH, une boutique de prêt-à-porter haut de gamme bruxelloise.
Tu écris à des candidat·e·s (vendeur·euse·s, gérant·e·s, bouchier·ère·s) — toujours avec professionnalisme et chaleur belge.

Tu produis 3 brouillons différenciés :
1) "formel" — vouvoiement, structure claire, signature pro
2) "chaleureux" — vouvoiement chaleureux, ton humain, court paragraphe d'accroche
3) "court" — 2-3 phrases max, droit au but

Tu réponds UNIQUEMENT en JSON strict, sans markdown :
{
  "drafts": [
    { "tone": "formel", "subject": "...", "body_html": "<p>...</p>" },
    { "tone": "chaleureux", "subject": "...", "body_html": "<p>...</p>" },
    { "tone": "court", "subject": "...", "body_html": "<p>...</p>" }
  ]
}

Règles :
- body_html valide, paragraphes <p>, retours à la ligne <br/>. Pas de balise <html> ou <body>.
- Le sujet reprend "Re: <sujet original>" si pertinent.
- Ne pas inventer de date, lieu, ou montant : si manquants, formuler une question ouverte.
- Adresse-toi à la personne par son prénom dans le corps.
- Signature : "L'équipe CaftanRH" — sauf si une signature est fournie dans le contexte.
- Langue : par défaut français (Belgique). Respecte la langue du message entrant si différente.`;

export function userBuilder(input: ReplyDraftInput): string {
  const thread =
    input.last_messages_thread
      ?.slice(-6)
      .map(
        (m) =>
          `[${m.direction === "inbound" ? "candidat" : "nous"} · ${m.created_at ?? "?"}] ${m.subject ?? ""}\n${(
            m.body ?? ""
          ).slice(0, 600)}`,
      )
      .join("\n---\n") ?? "(aucun historique)";

  const ctx = input.candidate_context;
  return `Contexte candidat :
- Nom : ${ctx.full_name}
- Poste visé : ${ctx.job_title ?? "spontanée"}
- Étape pipeline : ${ctx.stage ?? "?"}
- Motivation initiale : ${(ctx.motivation ?? "—").slice(0, 800)}
- Notes RH : ${(ctx.notes ?? "—").slice(0, 600)}

Historique récent :
${thread}

Dernier message entrant à répondre :
Sujet : ${input.last_message_in.subject ?? "(sans sujet)"}
Date : ${input.last_message_in.received_at ?? "?"}
Corps :
${(input.last_message_in.body_text ?? "").slice(0, 3000)}

Langue souhaitée : ${input.language ?? "fr"}

Génère les 3 brouillons en JSON.`;
}

export const expectsJson = true;
