// Karim 2026-06-14 : QCM "intelligent" de l'agent d'astreinte (incrément 2c).
//
// Pour chaque type d'incident (signature) on fournit :
//   - une EXPLICATION claire et simple : ce que c'est (what), pourquoi ça compte
//     (why), et les remèdes possibles (remedies) ;
//   - PLUSIEURS questions QCM pertinentes (questions[]) qui font apprendre le
//     système. La 1re question (id "default") pilote le comportement de l'agent
//     (notify_only / ignore_auto / auto_fix) ; les suivantes capturent des
//     préférences supplémentaires (dimensions d'apprentissage).
//
// Les détails propres à l'incident (la PERSONNE, l'événement, l'heure) viennent
// du payload `data.explain` de l'incident (rempli à la création) ; ici on décrit
// le TYPE de panne, pas l'occurrence précise.

export type Behavior = "notify_only" | "ignore_auto" | "auto_fix";
export type QcmMode = "auto" | "suggest";

export type QcmOption = { key: string; label: string; hint: string; mode: QcmMode };
export type QcmQuestion = { id: string; question: string; options: QcmOption[] };

/** Explication structurée affichée en tête de l'écran incident. */
export type IncidentExplain = {
  /** Qui est concerné (employé, terminal…). Optionnel. */
  who?: string | null;
  /** L'événement précis (heure, action). Optionnel. */
  event?: string | null;
  /** Ce que c'est, en une phrase simple. */
  what: string;
  /** Pourquoi ça compte (impact concret). */
  why: string;
  /** Les remèdes à appliquer. */
  remedies: string[];
};

export type Qcm = {
  signature: string;
  /** Explication générique du TYPE de panne (fallback si l'incident n'a pas de data.explain). */
  what: string;
  why: string;
  remedies: string[];
  questions: QcmQuestion[];
};

const PLAYBOOK_SIGNATURES = new Set<string>([
  "tuya_ingestion_stalled",
  "no_presence_daytime",
  "open_clocks_24h",
]);

// --- Options réutilisables pour la question PRIMAIRE (pilote l'agent) ---
const PRIMARY_NOTIFY: QcmOption = {
  key: "notify_only",
  label: "M'alerter et attendre ma décision",
  hint: "Comportement par défaut : l'agent te prévient une fois et n'agit pas seul.",
  mode: "suggest",
};
const PRIMARY_AUTOFIX: QcmOption = {
  key: "auto_fix",
  label: "Répare automatiquement, dis-moi juste le résultat",
  hint: "L'agent applique la réparation à chaque occurrence et ne te notifie que du bilan.",
  mode: "auto",
};
const PRIMARY_IGNORE: QcmOption = {
  key: "ignore_auto",
  label: "Gère en silence (ne plus m'alerter)",
  hint: "L'agent clôt ce type d'alerte tout seul à l'avenir. Révocable à tout moment.",
  mode: "auto",
};

/** Construit la 1re question (pilote agent) selon que la signature a un playbook. */
function buildPrimary(signature: string, question: string): QcmQuestion {
  const options: QcmOption[] = [PRIMARY_NOTIFY];
  if (PLAYBOOK_SIGNATURES.has(signature)) options.push(PRIMARY_AUTOFIX);
  options.push(PRIMARY_IGNORE);
  return { id: "default", question, options };
}

type Template = {
  what: string;
  why: string;
  remedies: string[];
  primary: string; // libellé de la question primaire
  extra: QcmQuestion[]; // questions d'apprentissage supplémentaires
};

const TEMPLATES: Record<string, Template> = {
  unmapped_badges: {
    what: "Un badge a été scanné sur un terminal, mais l'empreinte (le « slot ») n'est rattachée à aucun employé dans le système.",
    why: "Le passage est PERDU : ni entrée ni sortie enregistrée. C'est la cause n°1 des sorties manquantes, des fausses présences et des heures de paie inexactes.",
    remedies: [
      "Faire badger la personne, puis mapper son slot en 1 clic dans /admin/tuya/logs.",
      "Si plusieurs slots par personne (plusieurs doigts), mapper chacun.",
      "Le détecteur t'alerte désormais à chaque badge perdu — plus de perte silencieuse.",
    ],
    primary: "Quand un badge est perdu faute de mapping, que dois-je faire ?",
    extra: [
      {
        id: "guess_employee",
        question: "Veux-tu que je tente de deviner l'employé probable (via l'empreinte alpha déjà enrôlée) et que je te le propose en 1 clic ?",
        options: [
          { key: "yes", label: "Oui, propose-moi le nom à confirmer", hint: "Je pré-remplis l'employé probable, tu valides.", mode: "auto" },
          { key: "no", label: "Non, je préfère mapper moi-même", hint: "Tu choisis l'employé manuellement à chaque fois.", mode: "suggest" },
        ],
      },
      {
        id: "urgency",
        question: "À partir de combien de badges perdus veux-tu être alerté ?",
        options: [
          { key: "any", label: "Dès le 1er badge perdu", hint: "Réactivité maximale.", mode: "suggest" },
          { key: "threshold", label: "Seulement si 3 badges ou plus", hint: "Moins de bruit, on attend un vrai signal.", mode: "suggest" },
        ],
      },
    ],
  },

  open_clocks_24h: {
    what: "Un employé a pointé son ENTRÉE mais aucune SORTIE n'a été enregistrée, et la session reste ouverte depuis plus de 24h.",
    why: "L'employé apparaît « présent » indéfiniment (fausse présence) et ses heures sont fausses. Souvent un badge de sortie oublié OU droppé faute de mapping.",
    remedies: [
      "Fermer la session avec une heure estimée (cron force-close-orphans) — à valider par la RH.",
      "Si la sortie a été badgée mais perdue : mapper le slot OUT de la personne.",
      "Un vrai badge OUT remplace désormais automatiquement l'estimation (plus d'IN fantôme).",
    ],
    primary: "Pour une session restée ouverte >24h, que dois-je faire ?",
    extra: [
      {
        id: "estimate_basis",
        question: "Sur quelle base estimer la sortie quand elle manque vraiment ?",
        options: [
          { key: "site_close", label: "L'heure de fermeture du magasin", hint: "Sortie = fermeture du site ce jour-là.", mode: "auto" },
          { key: "history", label: "L'heure de sortie habituelle de la personne", hint: "Médiane historique de ses sorties.", mode: "auto" },
        ],
      },
    ],
  },

  tuya_ingestion_stalled: {
    what: "Le poll Tuya (qui importe les badges des terminaux) n'a rien importé depuis plus de 12h.",
    why: "Les pointages ne remontent plus : présence vide, heures non comptées. Tout le suivi du jour est faussé.",
    remedies: [
      "Relancer le poll Tuya pour rattraper les passages manqués.",
      "Vérifier que les crons GitHub tournent et que les terminaux sont en ligne.",
    ],
    primary: "Si l'import des badges s'arrête, que dois-je faire ?",
    extra: [
      {
        id: "retry_then_alert",
        question: "Combien de relances automatiques avant de m'alerter ?",
        options: [
          { key: "alert_now", label: "Alerte-moi tout de suite (et relance)", hint: "Tu es prévenu dès le 1er échec.", mode: "suggest" },
          { key: "retry_3", label: "Relance 3× en silence, alerte si ça persiste", hint: "Moins de bruit pour les coupures brèves.", mode: "auto" },
        ],
      },
    ],
  },

  crons_frozen: {
    what: "Le pilote automatique (poll, sync, relances) semble figé : son dernier cycle remonte à plusieurs heures.",
    why: "Si c'est réel, plus rien ne tourne automatiquement. (Souvent un faux positif lié à une période sans activité — désormais corrigé par un vrai battement de cœur.)",
    remedies: [
      "Vérifier que les workflows GitHub planifiés s'exécutent.",
      "S'assurer que le workflow est sur la branche par défaut du dépôt.",
    ],
    primary: "Si les crons semblent figés, que dois-je faire ?",
    extra: [],
  },

  failed_mails: {
    what: "Un ou plusieurs e-mails sortants ont échoué cette semaine.",
    why: "Des destinataires (candidats, employés) n'ont rien reçu. Selon le contenu, ça peut bloquer un recrutement ou une info importante.",
    remedies: [
      "Vérifier la configuration d'envoi (Resend / EmailJS / SMTP) et les logs dans /rh/mails.",
      "Règle permanente : on ne renvoie PAS les mails passés cassés, on corrige seulement les futurs envois.",
    ],
    primary: "Quand des e-mails échouent, que dois-je faire ?",
    extra: [
      {
        id: "resend_policy",
        question: "Faut-il un jour proposer de renvoyer un mail échoué (avec ta confirmation) ?",
        options: [
          { key: "never", label: "Jamais (règle actuelle)", hint: "On ne renvoie pas les mails passés cassés.", mode: "auto" },
          { key: "ask", label: "Me proposer au cas par cas", hint: "L'agent te demande avant tout renvoi.", mode: "suggest" },
        ],
      },
    ],
  },

  no_presence_daytime: {
    what: "Aucun employé n'est pointé alors qu'on est en pleine journée d'ouverture.",
    why: "Anormal : soit l'ingestion Tuya est en panne, soit personne n'a pu badger. Risque de journée entière non comptée.",
    remedies: [
      "Relancer le poll Tuya et vérifier les terminaux.",
      "Vérifier qu'un terminal n'est pas hors ligne.",
    ],
    primary: "Si personne n'est pointé en pleine journée, que dois-je faire ?",
    extra: [],
  },

  anomalous_clocks: {
    what: "Des pointages sont marqués anormaux (jours incomplets, sessions trop longues, doubles lectures).",
    why: "Ils faussent les heures et la paie s'ils ne sont pas corrigés ou validés.",
    remedies: [
      "Les revoir et corriger depuis l'écran de présence / la fiche prestations de l'employé.",
    ],
    primary: "Pour les pointages anormaux, que dois-je faire ?",
    extra: [
      {
        id: "auto_correct_conf",
        question: "À partir de quel niveau de confiance puis-je corriger automatiquement un pointage anormal ?",
        options: [
          { key: "high", label: "Seulement si très sûr (≥90%)", hint: "Prudent : je ne corrige que l'évident, le reste je te le soumets.", mode: "auto" },
          { key: "never", label: "Jamais sans moi", hint: "Tu valides chaque correction.", mode: "suggest" },
        ],
      },
    ],
  },
};

/** QCM générique pour une signature inconnue (incidents ad-hoc). */
function genericTemplate(signature: string): Template {
  return {
    what: `Incident « ${signature} » détecté.`,
    why: "À qualifier pour décider du bon traitement.",
    remedies: ["Examiner le contexte ci-dessus et choisir une option."],
    primary: `Comment veux-tu que je gère « ${signature} » à l'avenir ?`,
    extra: [],
  };
}

export function qcmFor(signature: string): Qcm {
  const t = TEMPLATES[signature] ?? genericTemplate(signature);
  return {
    signature,
    what: t.what,
    why: t.why,
    remedies: t.remedies,
    questions: [buildPrimary(signature, t.primary), ...t.extra],
  };
}

/** Libellé court d'une option apprise (pour afficher la règle active). */
export function behaviorLabel(b: string): string {
  switch (b) {
    case "notify_only": return "M'alerter";
    case "auto_fix": return "Réparer automatiquement";
    case "ignore_auto": return "Gérer en silence";
    case "yes": return "Oui";
    case "no": return "Non";
    case "any": return "Dès le 1er";
    case "threshold": return "Seuil ≥3";
    case "site_close": return "Heure de fermeture";
    case "history": return "Historique perso";
    case "alert_now": return "Alerte immédiate";
    case "retry_3": return "Relance puis alerte";
    case "never": return "Jamais";
    case "ask": return "Au cas par cas";
    case "high": return "≥90% seulement";
    default: return b;
  }
}

/** Valide qu'une option appartient bien à une question de la signature. */
export function isValidAnswer(signature: string, questionId: string, optionKey: string): boolean {
  const q = qcmFor(signature).questions.find((x) => x.id === questionId);
  return !!q && q.options.some((o) => o.key === optionKey);
}

export function modeForAnswer(signature: string, questionId: string, optionKey: string): QcmMode {
  const q = qcmFor(signature).questions.find((x) => x.id === questionId);
  return q?.options.find((o) => o.key === optionKey)?.mode ?? "suggest";
}

// Compat : conservé pour l'incident-manager (lit la règle primaire question_key='default').
export function isValidBehavior(b: string): b is Behavior {
  return b === "notify_only" || b === "ignore_auto" || b === "auto_fix";
}
export function modeForBehavior(b: Behavior): QcmMode {
  return b === "notify_only" ? "suggest" : "auto";
}
