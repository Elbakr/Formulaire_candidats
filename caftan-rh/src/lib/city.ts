// Karim 2026-05-25 : helper "ville" pour separer Bruxelles / Anvers dans
// l UI. Stocke dans un cookie HTTP lisible par les Server Components.
//
// Sites Bruxelles : A, B, D, E
// Sites Anvers    : C, F
// (Aucune migration BD : on filtre via le code du site.)

import { cookies } from "next/headers";

export type City = "bruxelles" | "anvers" | "all";
export const CITY_COOKIE = "caftanrh_city";
export const CITY_DEFAULT: City = "bruxelles";

export const BRUXELLES_SITE_CODES = ["A", "B", "D", "E"] as const;
export const ANVERS_SITE_CODES = ["C", "F"] as const;
export const ALL_SITE_CODES = ["A", "B", "C", "D", "E", "F"] as const;

export async function readCity(): Promise<City> {
  const c = await cookies();
  const v = c.get(CITY_COOKIE)?.value;
  if (v === "anvers") return "anvers";
  if (v === "all") return "all";
  return "bruxelles";
}

export function siteCodesForCity(city: City): readonly string[] {
  if (city === "anvers") return ANVERS_SITE_CODES;
  if (city === "all") return ALL_SITE_CODES;
  return BRUXELLES_SITE_CODES;
}
