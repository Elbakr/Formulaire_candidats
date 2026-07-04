"use server";

// Karim 2026-07-04 : reverse-geocoding (position GPS -> adresse) pour PRÉ-REMPLIR
// l'adresse du candidat sur le formulaire (gain de temps s'il est chez lui).
// Réutilise GOOGLE_MAPS_API_KEY (déjà dans Vercel). Pas de stockage ici — la
// position sert uniquement à proposer une adresse que le candidat valide/corrige.

type ReverseResult = {
  ok: boolean;
  error?: string;
  address?: string;
  postal_code?: string;
  city?: string;
};

export async function reverseGeocodeAction(lat: number, lng: number): Promise<ReverseResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, error: "Service de localisation indisponible." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "Position invalide." };

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&result_type=street_address|premise|route&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Géocodage indisponible (${res.status}).` };
    const j = (await res.json()) as {
      status: string;
      results?: Array<{ address_components: Array<{ long_name: string; short_name: string; types: string[] }> }>;
    };
    const comps = j.results?.[0]?.address_components;
    if (!comps || j.status !== "OK") return { ok: false, error: "Adresse introuvable à cette position." };

    const get = (type: string) => comps.find((c) => c.types.includes(type))?.long_name ?? "";
    const streetNo = get("street_number");
    const route = get("route");
    const address = [route, streetNo].filter(Boolean).join(" ").trim();
    const postal_code = get("postal_code");
    const city = get("locality") || get("postal_town") || get("administrative_area_level_2");

    return { ok: true, address: address || undefined, postal_code: postal_code || undefined, city: city || undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
