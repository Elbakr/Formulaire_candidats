// Karim 2026-06-14 : définitions des QCM de l'agent d'astreinte (incrément 2a).
//
// Chaque type de panne (signature) propose un QCM à l'admin via la notification.
// Les options sont HONNÊTES : on n'offre `auto_fix` que pour les pannes qui ont
// réellement un playbook de réparation. Choisir une option `mode:auto` AUTORISE
// explicitement l'agent à agir seul sur ce type de panne (révocable).

export type Behavior = "notify_only" | "ignore_auto" | "auto_fix";
export type QcmMode = "auto" | "suggest";

export type QcmOption = {
  key: Behavior;
  label: string;
  hint: string;
  mode: QcmMode;
};
export type Qcm = { signature: string; question: string; options: QcmOption[] };

// Signatures qui disposent d'un playbook de réparation sûr (cf. lib/incident/playbooks.ts).
const PLAYBOOK_SIGNATURES = new Set<string>([
  "tuya_ingestion_stalled",
  "no_presence_daytime",
  "open_clocks_24h",
]);

const OPT_NOTIFY: QcmOption = {
  key: "notify_only",
  label: "Juste me notifier",
  hint: "Comportement actuel : l'agent t'alerte une fois et attend ta décision.",
  mode: "suggest",
};
const OPT_AUTOFIX: QcmOption = {
  key: "auto_fix",
  label: "Répare automatiquement",
  hint: "L'agent lance la réparation à chaque occurrence et ne te notifie que du résultat.",
  mode: "auto",
};
const OPT_IGNORE: QcmOption = {
  key: "ignore_auto",
  label: "Gérer en silence (ne plus m'alerter)",
  hint: "L'agent clôt ce type d'alerte tout seul à l'avenir, sans te notifier. Révocable à tout moment.",
  mode: "auto",
};

const QUESTIONS: Record<string, string> = {
  failed_mails: "Des e-mails sortants ont échoué. Comment veux-tu que je gère ça à l'avenir ?",
  crons_frozen: "Les crons semblent figés. Comment veux-tu que je gère ça à l'avenir ?",
  tuya_ingestion_stalled: "L'ingestion des badges Tuya s'est arrêtée. Comment veux-tu que je gère ça à l'avenir ?",
  no_presence_daytime: "Aucun présent en pleine journée. Comment veux-tu que je gère ça à l'avenir ?",
  open_clocks_24h: "Des pointages restent ouverts depuis >24h. Comment veux-tu que je gère ça à l'avenir ?",
};

export function qcmFor(signature: string): Qcm {
  const question =
    QUESTIONS[signature] ?? `Comment veux-tu que je gère « ${signature} » à l'avenir ?`;
  const options: QcmOption[] = [OPT_NOTIFY];
  if (PLAYBOOK_SIGNATURES.has(signature)) options.push(OPT_AUTOFIX);
  options.push(OPT_IGNORE);
  return { signature, question, options };
}

/** Libellé court d'un comportement appris (pour l'UI / la règle active). */
export function behaviorLabel(b: string): string {
  switch (b) {
    case "notify_only": return "Juste notifier";
    case "auto_fix": return "Réparer automatiquement";
    case "ignore_auto": return "Gérer en silence";
    default: return b;
  }
}

export function isValidBehavior(b: string): b is Behavior {
  return b === "notify_only" || b === "ignore_auto" || b === "auto_fix";
}

export function modeForBehavior(b: Behavior): QcmMode {
  return b === "notify_only" ? "suggest" : "auto";
}
