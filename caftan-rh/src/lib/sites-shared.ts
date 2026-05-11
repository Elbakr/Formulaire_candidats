// Constantes + types partagés client/serveur pour les sites.
// Pas de dépendance à `next/headers` — peut être importé depuis un client.

export type Site = {
  id: string;
  code: string;
  name: string;
  abbr: string | null;
  city: string | null;
  address: string | null;
  color: string | null;
  light_color: string | null;
  sort_order: number;
  is_active: boolean;
};

export type SiteNeed = {
  id: string;
  site_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  headcount: number;
  role: string | null;
  is_friday_morning: boolean;
  is_friday_afternoon: boolean;
  is_critical: number | null;
  is_enabled: boolean | null;
};

export const DAY_LABELS_FR_FROM_SUNDAY = [
  "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam",
];
export const DAY_LABELS_FR_LONG_FROM_SUNDAY = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];

export function dayOfWeekJS(d: Date): number {
  return d.getDay();
}

export function totalRequiredHours(needs: SiteNeed[]): number {
  return needs.reduce((acc, n) => {
    const [sh, sm] = n.start_time.split(":").map(Number);
    const [eh, em] = n.end_time.split(":").map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    return acc + hours * n.headcount;
  }, 0);
}
