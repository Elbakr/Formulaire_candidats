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
    // Karim 2026-07-04 : pas de result_type restrictif (causait ZERO_RESULTS). On
    // prend le meilleur résultat contenant une rue.
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Géocodage indisponible (HTTP ${res.status}).` };
    const j = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{ address_components: Array<{ long_name: string; short_name: string; types: string[] }> }>;
    };
    if (j.status !== "OK" || !j.results?.length) {
      // REQUEST_DENIED = l'API "Geocoding" n'est pas activée sur la clé (à activer
      // dans Google Cloud, en plus de "Routes"). On remonte le statut pour diagnostiquer.
      const detail = j.status === "REQUEST_DENIED"
        ? "Active l'API « Geocoding » sur ta clé Google (Google Cloud Console)."
        : (j.error_message || j.status || "aucun résultat");
      return { ok: false, error: `Localisation impossible : ${detail}` };
    }

    // Choisit le résultat qui a une "route" (adresse précise), sinon le premier.
    const withRoute = j.results.find((r) => r.address_components.some((c) => c.types.includes("route"))) ?? j.results[0];
    const comps = withRoute.address_components;
    const get = (type: string) => comps.find((c) => c.types.includes(type))?.long_name ?? "";
    const address = [get("route"), get("street_number")].filter(Boolean).join(" ").trim();
    const postal_code = get("postal_code");
    const city = get("locality") || get("postal_town") || get("administrative_area_level_2") || get("administrative_area_level_1");

    return { ok: true, address: address || undefined, postal_code: postal_code || undefined, city: city || undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
