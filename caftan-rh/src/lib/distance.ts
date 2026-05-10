// Helpers de distance géographique (haversine) + lookups Supabase.
// Sert au scoring distance candidat ↔ magasins et au tri renfort employé.

import { createClient } from "@/lib/supabase/server";

const EARTH_RADIUS_KM = 6371;

// Centroïde régional de fallback quand on n'a pas de postcode mais une ville.
const REGION_FALLBACK: Record<string, { lat: number; lng: number; region: string }> = {
  bru: { lat: 50.8466, lng: 4.3528, region: "BRU" },
  bxl: { lat: 50.8466, lng: 4.3528, region: "BRU" },
  bruxelles: { lat: 50.8466, lng: 4.3528, region: "BRU" },
  brussels: { lat: 50.8466, lng: 4.3528, region: "BRU" },
  brussel: { lat: 50.8466, lng: 4.3528, region: "BRU" },
  anvers: { lat: 51.2194, lng: 4.4025, region: "FLA" },
  antwerpen: { lat: 51.2194, lng: 4.4025, region: "FLA" },
  antwerp: { lat: 51.2194, lng: 4.4025, region: "FLA" },
  liege: { lat: 50.6333, lng: 5.5667, region: "WAL" },
  liège: { lat: 50.6333, lng: 5.5667, region: "WAL" },
  charleroi: { lat: 50.4108, lng: 4.4445, region: "WAL" },
  mons: { lat: 50.4542, lng: 3.9514, region: "WAL" },
  namur: { lat: 50.4669, lng: 4.8675, region: "WAL" },
  gent: { lat: 51.0543, lng: 3.7174, region: "FLA" },
  gand: { lat: 51.0543, lng: 3.7174, region: "FLA" },
  brugge: { lat: 51.2093, lng: 3.2247, region: "FLA" },
  bruges: { lat: 51.2093, lng: 3.2247, region: "FLA" },
  leuven: { lat: 50.8794, lng: 4.7011, region: "FLA" },
  louvain: { lat: 50.8794, lng: 4.7011, region: "FLA" },
};

// Centre Bxl par défaut si un site n'a pas lat/lng renseigné (improbable
// après migration, mais garde la stack robuste).
const SITE_FALLBACK = { lat: 50.8466, lng: 4.3528 };

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type SiteCoord = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
};

/** Charge tous les sites actifs avec coords (fallback Bxl si manquant). */
export async function loadSiteCoords(): Promise<SiteCoord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("id, code, name, lat, lng, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  type Row = {
    id: string;
    code: string;
    name: string;
    lat: number | null;
    lng: number | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((r) => {
    if (r.lat == null || r.lng == null) {
      console.warn(
        `[distance] Site ${r.code} (${r.id}) sans lat/lng — fallback Bxl centre.`,
      );
      return { id: r.id, code: r.code, name: r.name, ...SITE_FALLBACK };
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
    };
  });
}

/**
 * Trouve les coordonnées d'un postcode candidat. Si introuvable, tente un
 * fallback sur la ville (champ `city`). Retourne null si aucun match.
 */
export async function lookupCoords(
  postcode: string | null | undefined,
  city: string | null | undefined = null,
): Promise<{ lat: number; lng: number; source: "postcode" | "city" } | null> {
  const supabase = await createClient();
  const pc = (postcode ?? "").toString().trim();
  if (pc) {
    const { data } = await supabase
      .from("be_postcodes")
      .select("lat, lng")
      .eq("postcode", pc)
      .maybeSingle();
    if (data && data.lat != null && data.lng != null) {
      return { lat: Number(data.lat), lng: Number(data.lng), source: "postcode" };
    }
  }
  const cityKey = (city ?? "").toString().trim().toLowerCase();
  if (cityKey && REGION_FALLBACK[cityKey]) {
    const f = REGION_FALLBACK[cityKey];
    return { lat: f.lat, lng: f.lng, source: "city" };
  }
  return null;
}

export type DistancesResult = {
  byCode: Record<string, number | null>;
  closestCode: string | null;
  closestDistanceKm: number | null;
};

/**
 * Calcule la distance d'un candidat (par postcode) vers chaque site actif.
 * Si introuvable, retourne null partout.
 */
export async function distanceCandidateToSites(
  candidatePostcode: string | null | undefined,
  candidateCity: string | null | undefined = null,
): Promise<DistancesResult> {
  const sites = await loadSiteCoords();
  const empty: DistancesResult = {
    byCode: Object.fromEntries(sites.map((s) => [s.code, null])),
    closestCode: null,
    closestDistanceKm: null,
  };
  const coords = await lookupCoords(candidatePostcode, candidateCity);
  if (!coords) return empty;

  let closestCode: string | null = null;
  let closestKm: number | null = null;
  const byCode: Record<string, number | null> = {};
  for (const s of sites) {
    const km = haversineKm({ lat: coords.lat, lng: coords.lng }, s);
    byCode[s.code] = km;
    if (closestKm === null || km < closestKm) {
      closestKm = km;
      closestCode = s.code;
    }
  }
  return { byCode, closestCode, closestDistanceKm: closestKm };
}

/**
 * Convertit une distance (km) en sous-score 0-100 pour le scoring candidat.
 * <=5 km : 100 ; <=15 : 70 ; <=30 : 40 ; <=60 : 15 ; >60 : 0.
 * Si distance null → 50 (neutre, pas pénalisant).
 */
export function distanceToScore(km: number | null | undefined): number {
  if (km === null || km === undefined || Number.isNaN(km)) return 50;
  if (km <= 5) return 100;
  if (km <= 15) return 70;
  if (km <= 30) return 40;
  if (km <= 60) return 15;
  return 0;
}
