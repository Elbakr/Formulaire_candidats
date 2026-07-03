// Karim 2026-07-03 : constantes + types PARTAGÉS (client + serveur) du trajet
// domicile -> sièges. Séparé de commute.ts (server-only, qui appelle Google).

export const HEADQUARTERS = [
  { key: "brabant", label: "Siège — 230 rue de Brabant, 1030 Schaerbeek", address: "230 Rue de Brabant, 1030 Schaerbeek, Belgium" },
  { key: "gand", label: "Siège — 118 chaussée de Gand, 1080 Bruxelles", address: "118 Chaussée de Gand, 1080 Bruxelles, Belgium" },
] as const;

export type CommuteLeg = { drive_km: number | null; drive_min: number | null; transit_min: number | null };
export type CommuteResult = {
  address: string;
  byKey: Record<string, CommuteLeg>;
  computed_at: string;
  provider: "google_routes";
};
