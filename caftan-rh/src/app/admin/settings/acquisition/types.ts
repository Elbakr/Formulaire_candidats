// Types et constantes partagés pour la configuration d'acquisition.
// NE PAS marquer "use server".

export type AcquisitionConfig = {
  /** Score minimum (0-100) pour recommander HIRE après le pré-entretien. */
  min_score_to_hire: number;
  /** Délai (jours) avant d'envoyer une relance si le candidat n'a pas complété
   *  le pré-entretien. */
  pre_interview_relance_days: number;
  /** Fenêtre (jours ouvrables) à proposer pour planifier un entretien physique
   *  après validation du pré-entretien. */
  interview_planning_window_days: number;
};

export const DEFAULT_ACQUISITION_CONFIG: AcquisitionConfig = {
  min_score_to_hire: 65,
  pre_interview_relance_days: 3,
  interview_planning_window_days: 14,
};
