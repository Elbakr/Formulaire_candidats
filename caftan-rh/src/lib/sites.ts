// Module SERVER-ONLY (charge depuis Supabase via next/headers).
// Les types + constantes sont dans `./sites-shared.ts` pour usage côté client.
import { createClient } from "@/lib/supabase/server";

export {
  DAY_LABELS_FR_FROM_SUNDAY,
  DAY_LABELS_FR_LONG_FROM_SUNDAY,
  dayOfWeekJS,
  totalRequiredHours,
} from "./sites-shared";
export type { Site, SiteNeed } from "./sites-shared";

import type { Site, SiteNeed } from "./sites-shared";

export async function loadSites(): Promise<Site[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as Site[];
}

export async function loadSiteByCode(code: string): Promise<Site | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return (data as Site) ?? null;
}

export async function loadSiteNeeds(siteId: string): Promise<SiteNeed[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_needs")
    .select("*")
    .eq("site_id", siteId)
    .order("day_of_week")
    .order("start_time");
  return (data ?? []) as SiteNeed[];
}
