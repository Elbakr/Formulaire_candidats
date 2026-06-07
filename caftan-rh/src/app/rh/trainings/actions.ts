"use server";

// Karim 2026-06-06 : stub temporaire pour debloquer le build Vercel.
// Le actions.ts original a ete perdu (jamais commit dans git, pas dans le
// zip backup, pas dans une autre branche). Reconstruction propre prevue
// (cf mail recap 2026-06-06). En attendant, l'UI affiche un toast d'erreur
// clair sans casser le reste de l'app /rh/trainings.

export interface AddTrainingInput {
  employeeId: string;
  kind: string;
  title: string;
  provider?: string;
  obtainedAt: string;
  expiresAt?: string;
  level?: string;
  score?: number;
  hoursCompleted?: number;
  note?: string;
  certificateBase64?: string;
  certificateName?: string;
  certificateMime?: string;
}

export async function addTrainingAction(
  _input: AddTrainingInput
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: "Module formations en reconstruction — sera retabli prochainement.",
  };
}
