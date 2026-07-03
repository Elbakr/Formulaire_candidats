import "server-only";

// Karim 2026-07-03 : trajet domicile candidat/employé -> 2 SIÈGES (distance
// routière + temps voiture + temps TRANSPORTS EN COMMUN), via Google Routes API.
// Calculé à la demande puis MIS EN CACHE (candidates/employees.commute JSONB) —
// jamais d'appel API au rendu des pages (coût maîtrisé).

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

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

async function routeOne(
  key: string,
  origin: string,
  destination: string,
  mode: "DRIVE" | "TRANSIT",
): Promise<{ distanceMeters: number | null; durationSec: number | null } | null> {
  const body: Record<string, unknown> = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: mode,
  };
  if (mode === "DRIVE") body.routingPreference = "TRAFFIC_UNAWARE";
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Routes ${mode} ${res.status}: ${t.slice(0, 240)}`);
  }
  const j = (await res.json()) as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
  const r = j.routes?.[0];
  if (!r) return { distanceMeters: null, durationSec: null };
  return {
    distanceMeters: r.distanceMeters ?? null,
    durationSec: r.duration ? Number(String(r.duration).replace("s", "")) : null,
  };
}

/** Calcule le trajet vers les 2 sièges. Lève si la clé manque ou l'API échoue. */
export async function computeCommute(homeAddress: string): Promise<CommuteResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY absente (à ajouter dans Vercel).");
  if (!homeAddress || homeAddress.trim().length < 5) throw new Error("Adresse domicile incomplète.");

  const byKey: Record<string, CommuteLeg> = {};
  for (const hq of HEADQUARTERS) {
    const drive = await routeOne(key, homeAddress, hq.address, "DRIVE");
    let transitSec: number | null = null;
    try {
      const transit = await routeOne(key, homeAddress, hq.address, "TRANSIT");
      transitSec = transit?.durationSec ?? null;
    } catch {
      transitSec = null; // pas d'itinéraire transit trouvé -> on garde la voiture
    }
    byKey[hq.key] = {
      drive_km: drive?.distanceMeters != null ? Math.round(drive.distanceMeters / 100) / 10 : null,
      drive_min: drive?.durationSec != null ? Math.round(drive.durationSec / 60) : null,
      transit_min: transitSec != null ? Math.round(transitSec / 60) : null,
    };
  }
  return { address: homeAddress, byKey, computed_at: new Date().toISOString(), provider: "google_routes" };
}

/** Compose l'adresse domicile à géocoder à partir des champs de la fiche. */
export function buildHomeAddress(row: { address?: string | null; postal_code?: string | null; city?: string | null }): string {
  return [row.address, [row.postal_code, row.city].filter(Boolean).join(" "), "Belgium"]
    .filter((p) => p && String(p).trim())
    .join(", ");
}
