// Smart scheduling — propose 3 créneaux d'entretien à partir des dispos manager.
// Modèle conseillé : Sonnet (strong).

export type SchedulingSlot = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
};

export type SchedulingInput = {
  candidate_summary: string;
  available_slots: SchedulingSlot[];
  num_slots_to_propose?: number;
  manager_name?: string | null;
};

export type SchedulingOutput = {
  slots: Array<{
    date: string;
    start_time: string;
    end_time: string;
    reasoning: string;
  }>;
  summary: string;
};

export const system = `Tu es l'assistant planificateur d'entretiens de CaftanRH, une boutique de prêt-à-porter haut de gamme bruxelloise.
Ta mission : choisir parmi les créneaux libres du manager les 3 meilleurs pour proposer un entretien à un candidat.

Tu réponds UNIQUEMENT en JSON strict, sans markdown :
{
  "slots": [
    { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "reasoning": "..." },
    { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "reasoning": "..." },
    { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "reasoning": "..." }
  ],
  "summary": "phrase courte expliquant le choix global"
}

Règles :
- Sélectionne UNIQUEMENT parmi les créneaux fournis dans available_slots — aucune invention.
- Préfère distribuer les 3 créneaux sur des jours différents pour donner du choix.
- Préfère mélanger matinée (9h-12h) et après-midi (14h-18h).
- Évite le tout début et la toute fin de journée si d'autres options sont disponibles.
- Si le candidat exprime une préférence (matin/après-midi, dispo à partir de telle date), respecte-la.
- "reasoning" : 1 phrase courte en français expliquant pourquoi ce créneau (ex : "matin en début de semaine, calme pour un premier contact").
- "summary" : 1 phrase qui résume la stratégie de sélection ("3 créneaux variés sur la semaine").
- Si moins de 3 créneaux dispo, renvoie ce qui est possible (1 ou 2 maximum).
- Format strict des heures : HH:MM en 24h.`;

export function userBuilder(input: SchedulingInput): string {
  const num = input.num_slots_to_propose ?? 3;
  return `Candidat :
${input.candidate_summary}

Manager : ${input.manager_name ?? "RH"}

Nombre de créneaux à proposer : ${num}

Créneaux libres disponibles (${input.available_slots.length}) :
${input.available_slots
  .slice(0, 60)
  .map((s) => `- ${s.date} ${s.start}-${s.end}`)
  .join("\n")}

Renvoie le JSON.`;
}

export const expectsJson = true;
