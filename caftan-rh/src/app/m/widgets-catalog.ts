// Karim 2026-06-02 : catalogue des widgets disponibles sur le dashboard /m.
// Chaque widget a un id, label, description, icone, et un loader server qui
// renvoie les data necessaires au rendu.

export type WidgetId =
  | "pointage_live"
  | "heures_periode"
  | "planning_today"
  | "quick_actions"
  | "alerts"
  | "stats_salaires"
  | "mails_pending"
  | "candidates_pending"
  | "terminations_pending";

export interface WidgetMeta {
  id: WidgetId;
  label: string;
  description: string;
  icon: string; // lucide name
  defaultEnabled: boolean;
  defaultOrder: number;
}

export const WIDGETS_CATALOG: WidgetMeta[] = [
  { id: "pointage_live", label: "Pointage live", description: "Présents/attendus par site en temps réel", icon: "Activity", defaultEnabled: true, defaultOrder: 1 },
  { id: "heures_periode", label: "Heures période", description: "Total heures avec filtre jour/semaine/mois", icon: "Clock", defaultEnabled: true, defaultOrder: 2 },
  { id: "planning_today", label: "Planning aujourd'hui", description: "Qui travaille aujourd'hui, par site", icon: "Calendar", defaultEnabled: true, defaultOrder: 3 },
  { id: "alerts", label: "Alertes", description: "Validations en attente, fiches manquantes", icon: "AlertCircle", defaultEnabled: true, defaultOrder: 4 },
  { id: "quick_actions", label: "Actions rapides", description: "Top 10 boutons ultra essentiels", icon: "Zap", defaultEnabled: true, defaultOrder: 5 },
  { id: "stats_salaires", label: "Stats salaires", description: "Total à payer ce mois, fiches non payées", icon: "Wallet", defaultEnabled: false, defaultOrder: 6 },
  { id: "mails_pending", label: "Mails à traiter", description: "Mails reçus / réponses en attente", icon: "Mail", defaultEnabled: false, defaultOrder: 7 },
  { id: "candidates_pending", label: "Candidats à traiter", description: "Candidats new + screening en attente", icon: "UserCheck", defaultEnabled: false, defaultOrder: 8 },
  { id: "terminations_pending", label: "Ruptures à valider", description: "Demandes worker en attente RH", icon: "FileSignature", defaultEnabled: false, defaultOrder: 9 },
];

export interface UserPrefs {
  widgets?: Array<{ id: WidgetId; enabled: boolean; order: number }>;
  period?: "day" | "week" | "month";
  site_filter?: string | null;
}

export function mergePrefs(prefs: UserPrefs | null | undefined): Array<WidgetMeta & { enabled: boolean; order: number }> {
  const stored = prefs?.widgets ?? [];
  return WIDGETS_CATALOG.map((w) => {
    const userW = stored.find((x) => x.id === w.id);
    return {
      ...w,
      enabled: userW?.enabled ?? w.defaultEnabled,
      order: userW?.order ?? w.defaultOrder,
    };
  })
  .filter((w) => w.enabled)
  .sort((a, b) => a.order - b.order);
}
