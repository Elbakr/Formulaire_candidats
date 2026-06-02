// Karim 2026-06-02 : bibliotheque de templates RH PME pour les mails sortants.
// Chaque template a un id, label, categorie, et une fn renderTemplate(ctx)
// qui renvoie subject + body.
//
// Pour ajouter un template : edit ce fichier (pas de BD - versionne git).
// Variables disponibles :
//   {firstName} {fullName} {employerName} {contractType} {periodsList}
//   {effectiveDate} {currentYear} {hrEmail}

export type TemplateCategory = "offboarding" | "lifecycle" | "admin" | "festive";

export interface TemplateContext {
  firstName: string;
  fullName: string;
  employerName: string;
  contractType?: string | null;
  periodsList?: string;
  effectiveDate?: string;
  currentYear?: number;
  hrEmail?: string;
  customVars?: Record<string, string>;
}

export interface MessageTemplate {
  id: string;
  label: string;
  category: TemplateCategory;
  description: string;
  forContractTypes?: Array<"Étudiant" | "CDD" | "CDI" | "Intérim" | "all">;
  render(ctx: TemplateContext): { subject: string; body: string };
}

function pickName(ctx: TemplateContext): string {
  return ctx.firstName || ctx.fullName.split(" ")[0] || "";
}

// ============================================================
// OFFBOARDING
// ============================================================
const OFFBOARDING_WARM: MessageTemplate = {
  id: "farewell_warm",
  label: "Au revoir chaleureux (CDD/CDI)",
  category: "offboarding",
  description: "Message chaleureux et professionnel pour fin de contrat. Remerciements détaillés + porte ouverte.",
  forContractTypes: ["CDD", "CDI", "Intérim"],
  render(ctx) {
    const first = pickName(ctx);
    const periods = ctx.periodsList ?? "(voir pièces jointes)";
    const multi = (ctx.periodsList?.split("\n").length ?? 1) > 1;
    return {
      subject: `${multi ? "Tes dernières fiches de paie" : "Ta dernière fiche de paie"} — Merci pour ton parcours chez nous`,
      body: `Bonjour ${first},

Tu trouveras ${multi ? "en pièces jointes l'ensemble de tes dernières fiches de paie" : "en pièce jointe ta dernière fiche de paie"} liée${multi ? "s" : ""} à la fin de ton contrat de travail :

${periods}

${multi ? `(Comme habituellement transmis par notre secrétariat social, ces documents couvrent ton salaire de la dernière période ainsi que le solde de tout compte — pécule de vacances et/ou prime de fin d'année au prorata.)\n\n` : ""}Nous tenions à te remercier très sincèrement pour ta contribution, ton professionnalisme et la qualité de ton travail durant ton passage chez ${ctx.employerName}. Tu as été un membre apprécié de notre équipe.

Nous gardons un excellent souvenir de notre collaboration et te souhaitons le meilleur pour la suite de ton parcours professionnel. Si nos chemins venaient à se recroiser — opportunités, recommandations, ou tout simplement nouvelles — nous serons toujours ravis d'avoir de tes nouvelles.

Nous restons à ta disposition si tu as la moindre question concernant ces documents ou tout autre point administratif (certificat de travail, attestations C4, etc.).

Bien à toi et tous nos vœux de réussite,
L'équipe ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

const OFFBOARDING_STUDENT: MessageTemplate = {
  id: "farewell_student",
  label: "Au revoir étudiant",
  category: "offboarding",
  description: "Pour la fin du job étudiant. Ton chaleureux + invitation à revenir lors des futures périodes.",
  forContractTypes: ["Étudiant"],
  render(ctx) {
    const first = pickName(ctx);
    const periods = ctx.periodsList ?? "(voir pièce jointe)";
    return {
      subject: `Ta dernière fiche de paie — Merci ${first}`,
      body: `Bonjour ${first},

Tu trouveras en pièce jointe ta dernière fiche de paie :

${periods}

Nous tenions à te remercier sincèrement pour ton engagement, ta disponibilité et le sérieux dont tu as fait preuve durant ton job étudiant chez ${ctx.employerName}.

Ton parcours chez nous s'inscrit dans une expérience qui, nous l'espérons, te sera utile pour la suite — études comme vie professionnelle.

Si tu souhaites revenir nous rejoindre lors de prochaines périodes (vacances scolaires, fêtes de fin d'année, etc.), n'hésite surtout pas à nous le faire savoir : tu seras toujours le/la bienvenu(e) dans notre équipe.

Nous te souhaitons beaucoup de réussite dans tes études et dans tes projets.

Bien chaleureusement,
L'équipe ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

const OFFBOARDING_NEUTRAL: MessageTemplate = {
  id: "farewell_neutral",
  label: "Au revoir neutre / professionnel",
  category: "offboarding",
  description: "Court et professionnel, sans excès de chaleur. Utile pour les départs négociés ou tendus.",
  forContractTypes: ["CDD", "CDI", "Intérim"],
  render(ctx) {
    const first = pickName(ctx);
    const periods = ctx.periodsList ?? "(voir pièces jointes)";
    return {
      subject: `Fiches de paie finales — ${ctx.fullName}`,
      body: `Bonjour ${first},

Tu trouveras en pièces jointes tes dernières fiches de paie :

${periods}

Ces documents incluent ton salaire final et, le cas échéant, le solde de tout compte (pécule de vacances, prime de fin d'année au prorata).

Nous te souhaitons une bonne continuation professionnelle.

Pour toute question administrative (certificat de travail, attestation C4, etc.), reste à disposition de notre service RH.

Cordialement,
${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

const OFFBOARDING_SHORT: MessageTemplate = {
  id: "farewell_short_term",
  label: "Au revoir mission courte (intérim, extra)",
  category: "offboarding",
  description: "Pour les missions courtes ou les contrats d'extra. Léger, encourageant.",
  forContractTypes: ["Intérim", "CDD"],
  render(ctx) {
    const first = pickName(ctx);
    const periods = ctx.periodsList ?? "(voir pièce jointe)";
    return {
      subject: `Ta fiche de paie — Merci ${first}`,
      body: `Bonjour ${first},

Tu trouveras en pièce jointe ta fiche de paie pour la mission effectuée chez nous :

${periods}

Merci pour ton implication et la qualité de ton travail. Nous savons que les missions courtes demandent une grande capacité d'adaptation et tu as su parfaitement t'intégrer à l'équipe.

N'hésite pas à revenir vers nous pour d'autres missions futures — nous serons ravis de retravailler ensemble.

Bonne continuation,
L'équipe ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

// ============================================================
// LIFECYCLE (actifs)
// ============================================================
const PAYSLIP_SIMPLE: MessageTemplate = {
  id: "payslip_simple",
  label: "Envoi simple fiche de paie (actif)",
  category: "lifecycle",
  description: "Message standard pour envoi mensuel d'une fiche de paie, sans cérémonie.",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    const periods = ctx.periodsList ?? "(voir pièce jointe)";
    return {
      subject: `Ta fiche de paie — ${periods.split("\n")[0]?.replace(/^•\s*/, "") ?? ""}`,
      body: `Bonjour ${first},

Tu trouveras en pièce jointe ta fiche de paie :

${periods}

Pour toute question, n'hésite pas à nous contacter.

Bonne journée,
L'équipe ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

const WELCOME_NEW: MessageTemplate = {
  id: "welcome_new",
  label: "Bienvenue nouveau collaborateur",
  category: "lifecycle",
  description: "Mail de bienvenue le 1er jour. Annonce premiers documents administratifs.",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    return {
      subject: `Bienvenue chez ${ctx.employerName}, ${first} !`,
      body: `Bonjour ${first},

Toute l'équipe de ${ctx.employerName} te souhaite la bienvenue !

Nous sommes ravis de t'accueillir parmi nous et nous te remercions d'avoir choisi notre maison pour cette nouvelle aventure professionnelle.

Tu trouveras en pièce jointe les premiers documents administratifs nécessaires à ta prise de fonction.

Quelques contacts utiles :
• Service RH : ${ctx.hrEmail ?? "hr@caftanfactory.com"}
• Pour toute question pratique, n'hésite pas à demander à ton/ta manager direct(e).

À très vite et bon démarrage !

L'équipe ${ctx.employerName}`,
    };
  },
};

const BIRTHDAY: MessageTemplate = {
  id: "birthday",
  label: "Anniversaire collaborateur",
  category: "festive",
  description: "Vœux d'anniversaire chaleureux pour un employé actif.",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    return {
      subject: `🎉 Joyeux anniversaire ${first} !`,
      body: `Bonjour ${first},

Aujourd'hui c'est ton jour ! 🎂

Toute l'équipe de ${ctx.employerName} se joint à moi pour te souhaiter un excellent anniversaire. Une journée pleine de joie, de surprises et de bons moments avec tes proches.

Merci pour ta présence et ton implication au quotidien — tu fais partie de ce qui rend cette équipe si spéciale.

Bonne journée et profite bien !

L'équipe ${ctx.employerName}`,
    };
  },
};

const SEASON_GREETINGS: MessageTemplate = {
  id: "season_greetings",
  label: "Vœux fin d'année",
  category: "festive",
  description: "Vœux de fin d'année (Noël, Nouvel An). Souvent accompagne la fiche de décembre + 13e mois.",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    const year = ctx.currentYear ?? new Date().getFullYear();
    return {
      subject: `Bonnes fêtes de fin d'année ${year}`,
      body: `Bonjour ${first},

À l'approche de la fin d'année, toute l'équipe de ${ctx.employerName} tenait à te souhaiter d'excellentes fêtes.

Que cette période soit pour toi un moment de joie, de partage et de ressourcement avec tes proches.

Merci pour ton engagement tout au long de cette année ${year} — sans toi, nous ne serions pas là où nous en sommes aujourd'hui.

Nous te souhaitons une magnifique année ${year + 1}, pleine de réussites personnelles et professionnelles.

${ctx.periodsList ? `\nTu trouveras en pièce jointe ${ctx.periodsList.split("\n").length > 1 ? "tes fiches de paie" : "ta fiche de paie"} :\n\n${ctx.periodsList}\n` : ""}
Très belles fêtes,
L'équipe ${ctx.employerName}`,
    };
  },
};

const CONGRATS_PROMOTION: MessageTemplate = {
  id: "congrats_promotion",
  label: "Félicitations promotion / nouvelles responsabilités",
  category: "lifecycle",
  description: "Annonce officielle d'une promotion ou évolution de poste.",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    return {
      subject: `Félicitations ${first} — Nouvelles responsabilités`,
      body: `Bonjour ${first},

C'est avec un grand plaisir que nous t'annonçons officiellement ton évolution au sein de ${ctx.employerName}.

Cette évolution est le fruit de ton travail, de ton sérieux et de ta capacité à monter en compétences. Nous sommes convaincus que tu sauras parfaitement relever ce nouveau défi.

Tu trouveras en pièce jointe les documents formalisant ce changement (avenant au contrat, nouvelle fiche de fonction, etc.).

Toute l'équipe est derrière toi et nous restons disponibles pour toute question ou point que tu souhaiterais aborder.

Bravo et bonne continuation dans tes nouvelles responsabilités !

L'équipe ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

// ============================================================
// ADMIN
// ============================================================
const DOC_MISSING: MessageTemplate = {
  id: "doc_missing",
  label: "Demande document manquant",
  category: "admin",
  description: "Relance pour récupérer un document administratif manquant (Sis carte, attestation, etc.).",
  forContractTypes: ["all"],
  render(ctx) {
    const first = pickName(ctx);
    return {
      subject: `Document administratif à transmettre`,
      body: `Bonjour ${first},

Dans le cadre de la finalisation de ton dossier administratif, il nous manque encore un document de ta part.

Merci de nous le transmettre dès que possible (par retour de mail ou via ton espace personnel).

Cela nous permettra de finaliser ton dossier et de garantir le bon traitement de tes droits (paie, sécurité sociale, etc.).

Si tu as la moindre question, n'hésite pas à nous écrire.

Merci d'avance,
Service RH — ${ctx.employerName}
${ctx.hrEmail ?? "hr@caftanfactory.com"}`,
    };
  },
};

const CUSTOM_BLANK: MessageTemplate = {
  id: "custom_blank",
  label: "Message personnalisé (vide)",
  category: "admin",
  description: "Pas de template — tu écris tout. Utile pour les communications ad-hoc.",
  forContractTypes: ["all"],
  render(ctx) {
    return {
      subject: ``,
      body: ``,
    };
  },
};

// ============================================================
// REGISTRY
// ============================================================
export const TEMPLATES: MessageTemplate[] = [
  OFFBOARDING_WARM,
  OFFBOARDING_STUDENT,
  OFFBOARDING_NEUTRAL,
  OFFBOARDING_SHORT,
  PAYSLIP_SIMPLE,
  WELCOME_NEW,
  CONGRATS_PROMOTION,
  BIRTHDAY,
  SEASON_GREETINGS,
  DOC_MISSING,
  CUSTOM_BLANK,
];

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  offboarding: "Fin de contrat / Départ",
  lifecycle: "Cycle de vie employé",
  festive: "Vœux & événements",
  admin: "Administratif",
};

export function getTemplateById(id: string): MessageTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getDefaultTemplateForOffboarding(contractType: string | null | undefined): MessageTemplate {
  if (contractType === "Étudiant" || contractType === "Student") return OFFBOARDING_STUDENT;
  if (contractType === "Intérim") return OFFBOARDING_SHORT;
  return OFFBOARDING_WARM;
}
