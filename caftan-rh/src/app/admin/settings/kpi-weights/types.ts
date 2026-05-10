// Types et constantes partagés (NE PAS marquer "use server").

export type KpiWeights = {
  ponctualite: number;
  fiabilite: number;
  heures_vs_prevu: number;
  absences: number;
  rating_hebdo: number;
  ventes: number;
};

export const DEFAULT_KPI_WEIGHTS: KpiWeights = {
  ponctualite: 25,
  fiabilite: 25,
  heures_vs_prevu: 20,
  absences: 15,
  rating_hebdo: 15,
  ventes: 0,
};
