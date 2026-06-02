// Karim 2026-06-02 : dashboard mobile /m. URL courte pour raccourci iPhone.
// Server component qui charge prefs + sites + data des widgets actifs,
// passe au client component MobileDashboard pour rendu interactif.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { mergePrefs, type UserPrefs, type WidgetId } from "./widgets-catalog";
import { MobileDashboard } from "./mobile-dashboard";

export const dynamic = "force-dynamic";

export default async function MobileDashboardPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from("profiles")
    .select("mobile_dashboard_prefs, full_name")
    .eq("id", profile.id)
    .maybeSingle();
  const prefs = (profileRow?.mobile_dashboard_prefs ?? {}) as UserPrefs;

  const { data: sitesRaw } = await admin
    .from("sites")
    .select("id, name, code")
    .eq("is_active", true)
    .order("sort_order");
  const sites = (sitesRaw ?? []) as Array<{ id: string; name: string; code: string }>;

  const widgets = mergePrefs(prefs);
  const enabledIds = widgets.map((w) => w.id) as WidgetId[];

  // Charge data des widgets actifs cote server (premier render)
  const period = (prefs.period as "day" | "week" | "month") ?? "day";
  const siteId = prefs.site_filter ?? null;
  const { getMobileDashboardDataAction } = await import("./actions");
  const dataRes = await getMobileDashboardDataAction({ enabledWidgets: enabledIds, period, siteId });
  const data = dataRes.data ?? {};

  return (
    <MobileDashboard
      profileName={profileRow?.full_name ?? "Admin"}
      widgets={widgets}
      data={data}
      sites={sites}
      prefs={prefs}
    />
  );
}
