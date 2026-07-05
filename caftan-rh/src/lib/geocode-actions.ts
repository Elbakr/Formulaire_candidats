"use server";

// Karim 2026-07-04/05 : reverse-geocoding (position GPS -> adresse) pour PRÉ-REMPLIR
// l'adresse du candidat. Deux moteurs : 1) Google (si GOOGLE_MAPS_API_KEY + API
// Geocoding activée), 2) FALLBACK GRATUIT OpenStreetMap (Nominatim, AUCUNE clé) ->
// « ma position » fonctionne même si l'API Google n'est pas activée. Pas de stockage.

type ReverseResult = {
  ok: boolean;
  error?: string;
  address?: string;
  postal_code?: string;
  city?: string;
};

export async function reverseGeocodeAction(lat: number, lng: number): Promise<ReverseResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "Position invalide." };
  const g = await viaGoogle(lat, lng);
  if (g.ok) return g;
  const n = await viaNominatim(lat, lng);
  if (n.ok) return n;
  return { ok: false, error: g.error || n.error || "Localisation indisponible." };
}

async function viaGoogle(lat: number, lng: number): Promise<ReverseResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, error: "Google Maps: clé absente." };
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Google HTTP ${res.status}` };
    const j = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{ address_components: Array<{ long_name: string; short_name: string; types: string[] }> }>;
    };
    if (j.status !== "OK" || !j.results?.length) {
      return { ok: false, error: `Google ${j.status}${j.error_message ? ` (${j.error_message})` : ""}` };
    }
    const withRoute = j.results.find((r) => r.address_components.some((c) => c.types.includes("route"))) ?? j.results[0];
    const comps = withRoute.address_components;
    const get = (type: string) => comps.find((c) => c.types.includes(type))?.long_name ?? "";
    const address = [get("route"), get("street_number")].filter(Boolean).join(" ").trim();
    const city = get("locality") || get("postal_town") || get("administrative_area_level_2") || get("administrative_area_level_1");
    return { ok: true, address: address || undefined, postal_code: get("postal_code") || undefined, city: city || undefined };
  } catch (e) {
    return { ok: false, error: `Google: ${(e as Error).message}` };
  }
}

async function viaNominatim(lat: number, lng: number): Promise<ReverseResult> {
  try {
    // OpenStreetMap Nominatim : gratuit, sans clé. User-Agent requis par leur policy.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=fr`;
    const res = await fetch(url, { headers: { "User-Agent": "CaftanHR/1.0 (hr@caftanfactory.com)" } });
    if (!res.ok) return { ok: false, error: `OSM HTTP ${res.status}` };
    const j = (await res.json()) as {
      address?: Record<string, string>;
    };
    const a = j.address;
    if (!a) return { ok: false, error: "OSM: aucun résultat" };
    const road = a.road || a.pedestrian || a.footway || a.residential || "";
    const num = a.house_number || "";
    const address = [road, num].filter(Boolean).join(" ").trim();
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.city_district || "";
    return { ok: true, address: address || undefined, postal_code: a.postcode || undefined, city: city || undefined };
  } catch (e) {
    return { ok: false, error: `OSM: ${(e as Error).message}` };
  }
}
