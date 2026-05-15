// Registre central des regles de l autoplaner. Karim 15/05/2026 : "je
// veux que toutes ces regles soient reprises dans Settings et que chaque
// regle soit connue et desactivable si besoin".
//
// Chaque regle a :
//  - id : cle stable utilisee dans org_settings.autoplaner_rules JSONB
//  - label : nom court humain
//  - description : ce que la regle fait, quand elle s applique
//  - category : groupe d affichage
//  - defaultEnabled : valeur par defaut si la cle est absente du JSONB
//  - wired : true si la regle est effectivement plumbed via isRuleEnabled()
//    cote code ; false si la regle est documentee mais pas encore desactivable
//    (le toggle est present pour la transparence et marque "documentation only").

export type AutoplanerRuleCategory =
  | "generation"
  | "multipliers"
  | "priority"
  | "multi_site"
  | "overtime"
  | "validation"
  | "constraints";

export type AutoplanerRule = {
  id: string;
  label: string;
  description: string;
  category: AutoplanerRuleCategory;
  defaultEnabled: boolean;
  wired: boolean;
};

export const CATEGORY_LABELS: Record<AutoplanerRuleCategory, string> = {
  generation: "Génération de planning",
  multipliers: "Multiplicateurs effectifs",
  priority: "Pondération & priorité",
  multi_site: "Multi-sites & équilibrage",
  overtime: "Heures supplémentaires",
  validation: "Validation employés",
  constraints: "Contraintes employé",
};

export const AUTOPLANER_RULES: AutoplanerRule[] = [
  // ─── Generation ─────────────────────────────────────────────────────
  {
    id: "rule_j_plus_1",
    label: "Règle J+1",
    description:
      "Aucun shift ne peut être créé sur une date passée ou aujourd'hui. La planification commence systématiquement à J+1 (demain).",
    category: "generation",
    defaultEnabled: true,
    wired: false, // hardcoded partout, decision Karim fondamentale
  },
  {
    id: "anti_overlap_same_employee",
    label: "Anti-chevauchement même employé",
    description:
      "Refuse l'ajout/modif d'un shift qui chevauche un shift existant pour le même employé le même jour. Évite le double comptage d'heures.",
    category: "generation",
    defaultEnabled: true,
    wired: true,
  },
  {
    id: "smart_prefill_dialog",
    label: "Pré-remplissage intelligent du dialog shift",
    description:
      "À l'ouverture du ShiftDialog (création), pré-remplit start/end avec le premier créneau libre dans les heures d'ouverture du site, hors shifts déjà placés.",
    category: "generation",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "min_separation_long_shifts",
    label: "Pause min 10 min après shift ≥ 2h30",
    description:
      "Quand un shift fait au moins 2h30, le prochain shift du même jour ne peut commencer que 10 min après. Influence le calcul des créneaux libres et le pré-remplissage.",
    category: "generation",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "respect_partial_unavail",
    label: "Respect des indispos partielles",
    description:
      "Le générateur (per-employé et legacy) pousse le start_time du shift après la fin d'une indispo partielle (ex: cours 10:00-12:30 → shift démarre à 12:30) au lieu d'ignorer.",
    category: "generation",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "no_overlap_in_generation",
    label: "Anti-overlap dans la génération",
    description:
      "Le générateur per-employé vérifie l'overlap entre regular drafts ET OT proposals avant insert. Défense-in-depth au commit.",
    category: "generation",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Multipliers ────────────────────────────────────────────────────
  {
    id: "holiday_staff_multiplier",
    label: "Multiplicateur d'effectif jour férié",
    description:
      "Applique le champ holidays.staff_multiplier les jours de férié (ex: Aïd ×2, soldes ×1.5). Désactiver fige tous les jours à ×1.",
    category: "multipliers",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "crescendo_before_holidays",
    label: "Crescendo J-7 avant les 2 prochaines fêtes",
    description:
      "Les 7 jours avant chaque fête majeure (Aïd, Noël…) montent en effectif : ×1 à J-7 → ×3 à J-1 pour la 1ère fête, ×1.5 max pour la 2ème.",
    category: "multipliers",
    defaultEnabled: true,
    wired: true,
  },
  {
    id: "pont_friday_after_thursday",
    label: "Pont vendredi après jeudi férié",
    description:
      "Vendredi suivant un férié majeur du jeudi → ~×1.75 (75% du férié). Capture le rush du weekend prolongé.",
    category: "multipliers",
    defaultEnabled: true,
    wired: true,
  },
  {
    id: "pont_monday_before_tuesday",
    label: "Pont lundi avant mardi férié",
    description:
      "Lundi précédant un férié du mardi → ~×1.75. Symétrique du cas jeudi-vendredi.",
    category: "multipliers",
    defaultEnabled: true,
    wired: true,
  },
  {
    id: "pont_weekend_extended_monday",
    label: "Pont weekend étendu (sam/dim + lundi férié)",
    description:
      "Samedi/Dimanche avant un lundi férié (Pentecôte type) + mardi après → ~×1.75 sur 3-4 jours consécutifs. Cumule avec le crescendo Aïd si applicable.",
    category: "multipliers",
    defaultEnabled: true,
    wired: true,
  },
  {
    id: "seasonal_peak_multiplier",
    label: "Multiplicateur saisonnier",
    description:
      "Périodes saisonnières (Ramadan, soldes, fin d'année — table seasonal_events) ajustent l'effectif sur leur fenêtre peak/low/closed.",
    category: "multipliers",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Priority ───────────────────────────────────────────────────────
  {
    id: "manager_priority",
    label: "Priorité Manager dans le solver",
    description:
      "Employés is_manager=true placés en tête du tri pour phase 1 (contractuel) et phase 2 (OT). Leur réserve est consommée en premier.",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "site_manager_priority",
    label: "Priorité Responsable Magasin (encore plus)",
    description:
      "is_site_manager=true placés avant les managers. Absorbent l'overflow final.",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "manager_ot_boost_2x",
    label: "Cap OT Manager ×2.0 minimum",
    description:
      "Manager peut faire jusqu'à weekly_hours × 2.0 même si son ot_max_multiplier perso est inférieur. Trigger DB ajuste automatiquement.",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "site_manager_ot_boost_2_5x",
    label: "Cap OT Resp. Magasin ×2.5 minimum",
    description:
      "Responsable Magasin peut faire jusqu'à weekly_hours × 2.5. Cas d'extrême besoin (samedi de soldes + Aïd).",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "critical_needs_weight",
    label: "Pondération besoins critiques",
    description:
      "Besoins ultra-critiques (is_critical=2) pèsent 3× dans le scoring de criticité site (vs 2× pour critique=1, 1× pour normal).",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "senior_first_on_demanding_slots",
    label: "Senior en priorité sur créneaux exigeants",
    description:
      "Sur les jours pic (weekends, jeudi @ E, jour spécial, critique), les seniors (lead/senior) sont priorisés par rapport aux confirmé/junior.",
    category: "priority",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Multi-site ─────────────────────────────────────────────────────
  {
    id: "cross_site_criticality_sort",
    label: "Tri multi-sites par criticité",
    description:
      "Quand plusieurs sites sont générés simultanément, le solver les traite dans l'ordre de leur score de criticité (besoins×durée×criticité) décroissant.",
    category: "multi_site",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "no_employee_double_booking_cross_sites",
    label: "Anti-double-booking cross-sites",
    description:
      "Un employé ne peut pas être assigné simultanément à 2 sites différents le même créneau. Les conflits deviennent uncovered sur le site secondaire.",
    category: "multi_site",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Overtime ───────────────────────────────────────────────────────
  {
    id: "exhaust_quota_before_ot",
    label: "Épuiser quota contractuel avant OT",
    description:
      "Le solver et l'upsert manuel saturent d'abord weekly_hours en regular avant de basculer en OT. Garantit qu'on ne fait pas d'OT inutile.",
    category: "overtime",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "auto_split_at_quota",
    label: "Fractionnement auto au seuil quota",
    description:
      "Quand un shift dépasse weekly_hours, il est automatiquement coupé en 2 : regular jusqu'au seuil + OT pour le reste. Évite les heures hybrides.",
    category: "overtime",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "reclassify_existing_ot",
    label: "Reclasser OT existants en contractuel",
    description:
      "Lors d'une re-génération per-employé, si le quota contractuel n'est pas atteint, les shifts OT existants sont reclassés en regular jusqu'à saturation.",
    category: "overtime",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "ot_proposals_on_second_gen",
    label: "Propositions OT à la 2ème génération",
    description:
      "Si quota déjà saturé, le générateur per-employé propose des OT pour combler les besoins site non couverts (1 OT/jour max, only ot_eligible).",
    category: "overtime",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "ot_personal_cap",
    label: "Cap personnel OT par employé",
    description:
      "Le multiplicateur OT appliqué est min(slot_authorized, employee.ot_max_multiplier). Respecte le potentiomètre individuel défini par le RH.",
    category: "overtime",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Validation ─────────────────────────────────────────────────────
  {
    id: "mandatory_validation_rush_weeks",
    label: "Validation obligatoire avant rush",
    description:
      "Détection automatique des rushs (jours fériés intl, 15j Ramadan, vacances scolaires, ponts) → was_mandatory=true sur le run. Bypassable par RH.",
    category: "validation",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "score_penalty_cancelled_after_validation",
    label: "Pénalité score annulation post-validation",
    description:
      "Annulation après acceptation pèse 10× plus qu'un refus direct dans le score Fiabilité validation.",
    category: "validation",
    defaultEnabled: true,
    wired: false,
  },

  // ─── Contraints ─────────────────────────────────────────────────────
  {
    id: "fixed_off_days_respected",
    label: "Respect jours OFF fixes",
    description:
      "L'employé n'est jamais planifié sur ses jours OFF fixes (employees.fixed_off_days), sauf force majeure (jour spécial Aïd avec shops_closed=false).",
    category: "constraints",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "time_off_requests_respected",
    label: "Respect congés approuvés",
    description:
      "Les time_off_requests status='approved' bloquent la génération sur leur fenêtre.",
    category: "constraints",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "friday_prayer_pause",
    label: "Pause prière vendredi",
    description:
      "Coupe les shifts vendredi pour la pause prière (été 13:55-14:45, hiver 12:55-13:45). Configurable séparément dans la section Pause prière.",
    category: "constraints",
    defaultEnabled: true,
    wired: false,
  },
  {
    id: "shops_closed_holidays_block",
    label: "Magasins fermés les fériés Aïd",
    description:
      "Les jours holidays.shops_closed=true bloquent toute génération de shift (= magasin physiquement fermé).",
    category: "constraints",
    defaultEnabled: true,
    wired: false,
  },
];

/** Type retourne par loadAutoplanerRules : map id → enabled. */
export type AutoplanerRulesState = Record<string, boolean>;

/** Defauts pour toutes les regles : si la cle n est pas en DB, defaultEnabled prime. */
export function buildDefaultRules(): AutoplanerRulesState {
  const out: AutoplanerRulesState = {};
  for (const r of AUTOPLANER_RULES) out[r.id] = r.defaultEnabled;
  return out;
}

/** Merge config DB + defaults. */
export function mergeWithDefaults(
  configFromDB: Record<string, unknown> | null,
): AutoplanerRulesState {
  const out = buildDefaultRules();
  if (configFromDB && typeof configFromDB === "object") {
    for (const [k, v] of Object.entries(configFromDB)) {
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

/** Check si une regle est active. */
export function isRuleEnabled(
  rules: AutoplanerRulesState,
  ruleId: string,
): boolean {
  const v = rules[ruleId];
  if (typeof v === "boolean") return v;
  const def = AUTOPLANER_RULES.find((r) => r.id === ruleId);
  return def?.defaultEnabled ?? true;
}
