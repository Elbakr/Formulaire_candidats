// Karim 2026-06-14 : CATALOGUE des questions d'apprentissage de l'agent
// (vers l'« E-HR Director »). Chaque question capture une préférence de Karim
// sur la façon dont l'agent doit agir. Les réponses sont stockées dans
// agent_learnings avec signature = "policy" et question_key = id de la question.
//
// Les choix marqués mode:"auto" autorisent l'agent à agir seul sur ce point
// (révocable) ; "suggest" = il propose et attend.

export type TQOption = { key: string; label: string; hint?: string; mode: "auto" | "suggest" };

/**
 * Décrit un champ de saisie libre pour les questions quantifiables (identique à QcmCustomInput).
 * - type "percent"  : entier 0–100 (ou min/max spécifié)
 * - type "number"   : entier ≥ min (défaut 0), avec unité facultative
 * - type "text"     : texte court non vide, ≤200 car.
 */
export type TQCustomInput = {
  type: "percent" | "number" | "text";
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
};

export type TrainingQuestion = {
  id: string;
  category: string;
  question: string;
  why: string; // pourquoi cette question compte
  options: TQOption[];
  /** Champ de saisie libre optionnel (questions quantifiables). */
  custom?: TQCustomInput;
};

export const TRAINING_QUESTIONS: TrainingQuestion[] = [
  // ---------- Pointage : badges & mapping ----------
  {
    id: "unmapped_badge_action", category: "Pointage — badges",
    question: "Quand un badge est perdu faute de mapping (slot non rattaché), que dois-je faire ?",
    why: "C'est la cause n°1 des sorties manquantes et des fausses présences.",
    options: [
      { key: "alert", label: "M'alerter à chaque fois", mode: "suggest" },
      { key: "guess", label: "Deviner l'employé probable et me le proposer", hint: "Via l'empreinte alpha déjà enrôlée.", mode: "auto" },
      { key: "silence", label: "Gérer en silence", mode: "auto" },
    ],
  },
  {
    id: "unmapped_threshold", category: "Pointage — badges",
    question: "À partir de combien de badges perdus veux-tu être alerté ?",
    why: "Doser entre réactivité et bruit.",
    options: [
      { key: "1", label: "Dès le 1er", mode: "suggest" },
      { key: "3", label: "À partir de 3", mode: "suggest" },
      { key: "5", label: "À partir de 5", mode: "suggest" },
    ],
    custom: { type: "number", label: "Autre seuil", unit: "badges", min: 1, placeholder: "ex. 7" },
  },
  {
    id: "multi_finger", category: "Pointage — badges",
    question: "Beaucoup de travailleurs ont plusieurs empreintes. Comment gérer leurs slots ?",
    why: "Un slot non mappé = badge perdu, même si un autre doigt marche.",
    options: [
      { key: "all", label: "Me rappeler de mapper TOUS ses slots d'un coup", mode: "auto" },
      { key: "one", label: "Un slot à la fois, au fil des badges", mode: "suggest" },
    ],
  },
  {
    id: "antwerp_offline", category: "Pointage — terminaux",
    question: "Si un terminal (ex. Anvers) est hors ligne, que dois-je faire ?",
    why: "Un terminal offline = aucun pointage capté sur ce site.",
    options: [
      { key: "alert", label: "M'alerter seulement", mode: "suggest" },
      { key: "alert_store", label: "M'alerter ET prévenir le magasin", mode: "auto" },
    ],
  },

  // ---------- Sorties / auto-OUT ----------
  {
    id: "missing_out_estimate", category: "Pointage — sorties",
    question: "Quand une sortie manque vraiment, sur quelle base l'estimer ?",
    why: "Pour des heures justes même sans badge OUT.",
    options: [
      { key: "site_close", label: "L'heure de fermeture du magasin", mode: "auto" },
      { key: "history", label: "L'heure de sortie habituelle de la personne", mode: "auto" },
    ],
  },
  {
    id: "real_vs_estimate", category: "Pointage — sorties",
    question: "Si un VRAI badge de sortie arrive après un auto-OUT estimé, je fais quoi ?",
    why: "Évite les IN fantômes et les fausses présences (bug déjà corrigé en ce sens).",
    options: [
      { key: "replace", label: "Remplacer l'estimation par le badge réel", hint: "Comportement actuel recommandé.", mode: "auto" },
      { key: "keep", label: "Garder l'estimation, m'alerter", mode: "suggest" },
    ],
  },
  {
    id: "auto_out_grace", category: "Pointage — sorties",
    question: "Combien de temps après la fermeture du magasin avant d'auto-fermer une session ouverte ?",
    why: "Trop tôt = on coupe quelqu'un encore là ; trop tard = fausse présence.",
    options: [
      { key: "30", label: "30 minutes", mode: "auto" },
      { key: "60", label: "1 heure", mode: "auto" },
      { key: "120", label: "2 heures", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre durée", unit: "min", min: 5, max: 240, placeholder: "ex. 45" },
  },
  {
    id: "forgot_out_notify", category: "Pointage — sorties",
    question: "Quand une sortie est auto-fermée (oubli/badge perdu), qui prévenir ?",
    why: "Pour valider l'heure estimée au bon niveau.",
    options: [
      { key: "rh", label: "La RH (toi)", mode: "auto" },
      { key: "manager", label: "Le manager du magasin", mode: "auto" },
      { key: "both", label: "Les deux", mode: "auto" },
    ],
  },

  // ---------- Pointages anormaux ----------
  {
    id: "anomaly_confidence", category: "Pointage — anomalies",
    question: "À partir de quel niveau de confiance puis-je corriger automatiquement un pointage anormal ?",
    why: "Équilibre entre automatisation et contrôle.",
    options: [
      { key: "90", label: "Seulement si ≥90% sûr", mode: "auto" },
      { key: "never", label: "Jamais sans toi", mode: "suggest" },
    ],
    custom: { type: "percent", label: "Autre seuil", unit: "%", min: 50, max: 99, placeholder: "ex. 75" },
  },
  {
    id: "long_session", category: "Pointage — anomalies",
    question: "Une session de plus de 12h (probable oubli) : que faire ?",
    why: "Sinon elle gonfle les heures.",
    options: [
      { key: "flag", label: "La signaler pour validation RH", mode: "auto" },
      { key: "cut", label: "La couper auto à l'heure de fermeture", mode: "auto" },
    ],
  },

  // ---------- Mails ----------
  {
    id: "failed_mail_resend", category: "Communication",
    question: "Faut-il un jour proposer de renvoyer un e-mail échoué ?",
    why: "Ta règle actuelle : on ne renvoie pas les mails passés cassés.",
    options: [
      { key: "never", label: "Jamais (règle actuelle)", mode: "auto" },
      { key: "ask", label: "Me proposer au cas par cas", mode: "suggest" },
    ],
  },
  {
    id: "failed_mail_alert", category: "Communication",
    question: "À partir de combien d'e-mails échoués veux-tu être alerté ?",
    why: "Doser le bruit.",
    options: [
      { key: "1", label: "Dès le 1er", mode: "suggest" },
      { key: "5", label: "À partir de 5", mode: "suggest" },
    ],
    custom: { type: "number", label: "Autre seuil", unit: "mails", min: 1, placeholder: "ex. 3" },
  },

  // ---------- Système / ingestion ----------
  {
    id: "ingestion_stalled", category: "Système",
    question: "Si l'import des badges s'arrête, combien de relances auto avant de m'alerter ?",
    why: "Les coupures brèves se résolvent souvent seules.",
    options: [
      { key: "now", label: "Alerte-moi tout de suite (et relance)", mode: "suggest" },
      { key: "3", label: "Relance 3× en silence, alerte si ça persiste", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre nombre de relances", unit: "relances", min: 1, max: 10, placeholder: "ex. 5" },
  },
  {
    id: "autonomy_default", category: "Autonomie",
    question: "Par défaut, quelle attitude veux-tu que j'adopte ?",
    why: "Le curseur global de ton agent.",
    options: [
      { key: "propose", label: "Propose, je valide tout", mode: "suggest" },
      { key: "safe_auto", label: "Agis sur le sûr, confirme le sensible", mode: "auto" },
      { key: "max_auto", label: "Agis au maximum, alerte-moi seulement sur l'exception", mode: "auto" },
    ],
  },

  // ---------- Congés (self-service) ----------
  {
    id: "leave_auto_validate", category: "Congés",
    question: "Une demande de congé conforme à toutes les règles : auto-valider ?",
    why: "Cœur du self-service : éviter de te solliciter pour les cas standards.",
    options: [
      { key: "auto", label: "Oui, auto-valider + informer le manager", mode: "auto" },
      { key: "escalate", label: "Escalader au manager pour décision 1-clic", mode: "suggest" },
    ],
  },
  {
    id: "leave_notice_days", category: "Congés",
    question: "Préavis minimum pour qu'un congé soit auto-validable ?",
    why: "Règle paramétrable d'auto-validation.",
    options: [
      { key: "7", label: "7 jours", mode: "auto" },
      { key: "14", label: "14 jours", mode: "auto" },
      { key: "30", label: "30 jours", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre durée", unit: "jours", min: 1, max: 90, placeholder: "ex. 10" },
  },
  {
    id: "leave_max_absent", category: "Congés",
    question: "% maximum d'absents simultanés pour auto-valider un congé ?",
    why: "Protéger la couverture du magasin.",
    options: [
      { key: "20", label: "20%", mode: "auto" },
      { key: "30", label: "30%", mode: "auto" },
      { key: "50", label: "50%", mode: "auto" },
    ],
    custom: { type: "percent", label: "Autre %", unit: "%", min: 10, max: 80, placeholder: "ex. 25" },
  },

  // ---------- Congés : couverture & remplacement ----------
  {
    id: "leave_need_coverage", category: "Congés — remplacement",
    question: "Conditionner l'auto-validation d'un congé à la possibilité de COMBLER le manque (quota de disponibilités suffisant pour substituer) ?",
    why: "Un congé ne doit passer en auto que si un remplacement est réellement possible.",
    options: [
      { key: "require", label: "Oui — exiger qu'un remplacement couvre le manque", mode: "auto" },
      { key: "no_constraint", label: "Non — pas de condition de couverture", mode: "suggest" },
    ],
  },
  {
    id: "replace_sort", category: "Congés — remplacement",
    question: "Comment classer les remplaçants proposés ?",
    why: "Proposer d'abord les meilleurs.",
    options: [
      { key: "reliability_perf", label: "Par fiabilité + performance (scoring)", mode: "auto" },
      { key: "proximity", label: "Par proximité géographique", mode: "auto" },
      { key: "hours_left", label: "Par heures restantes à faire", mode: "auto" },
    ],
  },
  {
    id: "replace_precheck", category: "Congés — remplacement",
    question: "Les remplaçants proposés sont-ils cochés par défaut dans la proposition ?",
    why: "Gagner du temps : tout coché, tu décoches si besoin.",
    options: [
      { key: "all_checked", label: "Oui, tous cochés par défaut", mode: "auto" },
      { key: "none", label: "Non, je coche manuellement", mode: "suggest" },
    ],
  },
  {
    id: "leave_j1_rh_first", category: "Congés — remplacement",
    question: "Demande de congé pour J+1 (demain) : envoyer d'abord au RH (intervention humaine requise) ?",
    why: "Les demandes très proches méritent un œil humain.",
    options: [
      { key: "rh_first", label: "Oui, au RH d'abord (toujours désactivable)", mode: "auto" },
      { key: "cascade", label: "Non, cascade auto directe aux dispos", mode: "auto" },
    ],
  },
  {
    id: "urgent_rh_timeout", category: "Congés — remplacement",
    question: "Absence URGENTE (maladie, accident, impossibilité, démission) : combien de temps sans accusé de réception du RH avant de lancer la cascade auto aux remplaçants ?",
    why: "Si la RH ne réagit pas, le remplacement urgent doit partir seul.",
    options: [
      { key: "10", label: "10 minutes", mode: "auto" },
      { key: "20", label: "20 minutes", mode: "auto" },
      { key: "30", label: "30 minutes", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre délai", unit: "min", min: 5, max: 60, placeholder: "ex. 15" },
  },
  {
    id: "urgent_cascade_interval", category: "Congés — remplacement",
    question: "Cascade de remplacement urgent : intervalle entre chaque proposition envoyée ?",
    why: "Laisser à chacun le temps de répondre avant de passer au suivant.",
    options: [
      { key: "3", label: "3 minutes", mode: "auto" },
      { key: "5", label: "5 minutes", mode: "auto" },
      { key: "10", label: "10 minutes", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre intervalle", unit: "min", min: 1, max: 30, placeholder: "ex. 7" },
  },
  {
    id: "urgent_cascade_mode", category: "Congés — remplacement",
    question: "Comment proposer le remplacement urgent ?",
    why: "Un par un protège l'équité et évite le double oui.",
    options: [
      { key: "one_by_one", label: "Un par un (ordre fiabilité+perf), sur leurs plages déclarées, jusqu'à acceptation", mode: "auto" },
      { key: "all_at_once", label: "À tous les disponibles d'un coup", mode: "auto" },
    ],
  },

  // ---------- Planning ----------
  {
    id: "swap_auto_validate", category: "Planning",
    question: "Un échange de shift conforme (compétences, heures, pas de double-réservation) : auto-valider ?",
    why: "Self-service planning.",
    options: [
      { key: "auto", label: "Oui, auto-valider + informer le manager", mode: "auto" },
      { key: "escalate", label: "Escalader au manager", mode: "suggest" },
    ],
  },
  {
    id: "reinforcement_auto", category: "Planning",
    question: "Besoin de renfort : proposer automatiquement aux employés disponibles ?",
    why: "Gagner du temps sur les remplacements.",
    options: [
      { key: "propose", label: "Oui, propose auto (classés par proximité/heures)", mode: "auto" },
      { key: "manual", label: "Non, je déclenche moi-même", mode: "suggest" },
    ],
  },
  {
    id: "weekly_plan_validate", category: "Planning",
    question: "Le planning auto-généré du dimanche : tu veux le valider toi-même ?",
    why: "Décision potentiellement déléguable au manager.",
    options: [
      { key: "manager", label: "Le manager valide en 1 clic", mode: "auto" },
      { key: "me", label: "Je veux valider moi-même", mode: "suggest" },
    ],
  },

  // ---------- Cycle de vie / CDD ----------
  {
    id: "cdd_renewal_lead", category: "Cycle de vie",
    question: "Combien de jours avant la fin d'un CDD dois-je préparer la fiche de décision ?",
    why: "Décision légale humaine, mais le dossier peut être prêt à l'avance.",
    options: [
      { key: "30", label: "30 jours", mode: "auto" },
      { key: "45", label: "45 jours", mode: "auto" },
      { key: "60", label: "60 jours", mode: "auto" },
    ],
    custom: { type: "number", label: "Autre délai", unit: "jours", min: 7, max: 90, placeholder: "ex. 21" },
  },
  {
    id: "cdd_reco_auto", category: "Cycle de vie",
    question: "Préparer automatiquement la recommandation de renouvellement (score, tendances, justification) ?",
    why: "Tu gardes la décision finale, mais le dossier est prêt.",
    options: [
      { key: "auto", label: "Oui, prépare tout, je décide en 1 clic", mode: "auto" },
      { key: "ask", label: "Demande-moi avant de préparer", mode: "suggest" },
    ],
  },

  // ---------- Candidats ----------
  {
    id: "candidate_autoreply", category: "Acquisition",
    question: "Accusé de réception d'une candidature : auto-envoyer ?",
    why: "Aucun candidat sans réponse.",
    options: [
      { key: "auto", label: "Oui, auto-envoyer", mode: "auto" },
      { key: "manual", label: "Non, je gère", mode: "suggest" },
    ],
  },
  {
    id: "candidate_relance", category: "Acquisition",
    question: "Relance d'un candidat sans réponse après 5 jours : automatique ?",
    why: "Maintenir le pipeline sans intervention.",
    options: [
      { key: "auto", label: "Oui, relance auto puis mise en réserve", mode: "auto" },
      { key: "ask", label: "Me demander avant", mode: "suggest" },
    ],
  },
];

export function questionById(id: string): TrainingQuestion | undefined {
  return TRAINING_QUESTIONS.find((q) => q.id === id);
}

/**
 * Valide et normalise une valeur custom pour une question d'entraînement.
 * Réutilise les mêmes règles que parseCustomAnswer de qcm.ts (inline ici pour éviter
 * la dépendance circulaire entre modules).
 */
export type ParseTrainingCustomResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseTrainingCustomAnswer(
  question: TrainingQuestion,
  raw: string,
): ParseTrainingCustomResult {
  const c = question.custom;
  if (!c) return { ok: false, error: "Cette question n'accepte pas de valeur libre." };
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "La valeur ne peut pas être vide." };
  if (c.type === "text") {
    if (trimmed.length > 200) return { ok: false, error: "La valeur est trop longue (200 car. max)." };
    return { ok: true, value: trimmed };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || isNaN(n)) return { ok: false, error: "Entrez un nombre entier." };
  const min = c.min ?? 0;
  const max = c.max ?? (c.type === "percent" ? 100 : undefined);
  if (n < min) return { ok: false, error: `La valeur minimum est ${min}.` };
  if (max !== undefined && n > max) return { ok: false, error: `La valeur maximum est ${max}.` };
  return { ok: true, value: String(n) };
}

/**
 * Valide qu'une option appartient à la question.
 * Accepte "custom" si la question a un champ custom ET que customValue est valide.
 */
export function isValidTrainingAnswer(
  id: string,
  optionKey: string,
  customValue?: string,
): boolean {
  const q = questionById(id);
  if (!q) return false;
  if (optionKey === "custom") {
    if (!q.custom) return false;
    return parseTrainingCustomAnswer(q, customValue ?? "").ok;
  }
  return q.options.some((o) => o.key === optionKey);
}

/** Mode pour une réponse : "auto" si option fixe auto, "suggest" sinon. "custom" = toujours "auto". */
export function trainingModeFor(id: string, optionKey: string): "auto" | "suggest" {
  if (optionKey === "custom") return "auto";
  return questionById(id)?.options.find((o) => o.key === optionKey)?.mode ?? "suggest";
}

export function trainingOptionLabel(id: string, optionKey: string): string {
  return questionById(id)?.options.find((o) => o.key === optionKey)?.label ?? optionKey;
}

/** Catégories ordonnées (pour la page). */
export function categoriesOrdered(): string[] {
  const seen: string[] = [];
  for (const q of TRAINING_QUESTIONS) if (!seen.includes(q.category)) seen.push(q.category);
  return seen;
}
