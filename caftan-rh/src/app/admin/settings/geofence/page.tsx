import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GeofenceGlobalForm, GeofencePerSiteList } from "./geofence-form";

export default async function AdminGeofencePage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: orgRow }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("org_settings")
      .select("clock_geofence_strict")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id, code, name, color, light_color, geofence_radius_m, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const strict = (orgRow as { clock_geofence_strict?: boolean | null } | null)
    ?.clock_geofence_strict !== false;

  type Site = {
    id: string;
    code: string;
    name: string;
    color: string | null;
    light_color: string | null;
    geofence_radius_m: number | null;
  };
  const sites = (sitesRaw ?? []) as Site[];

  // Le "rayon par défaut" affiché = la valeur la plus fréquente parmi les sites
  // non-NULL. Sinon 100. Sert juste de pré-remplissage de l'input global.
  const counts = new Map<number, number>();
  for (const s of sites) {
    if (s.geofence_radius_m == null) continue;
    counts.set(s.geofence_radius_m, (counts.get(s.geofence_radius_m) ?? 0) + 1);
  }
  let mostCommon = 100;
  let bestCount = 0;
  for (const [r, c] of counts.entries()) {
    if (c > bestCount) {
      mostCommon = r;
      bestCount = c;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-gold-dark" />
            Géofence pointage
          </h1>
          <p className="text-sm text-ink-2">
            Empêche le clock-in à distance. Rayon par défaut 100 m, override par site.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/settings">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux paramètres
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Paramètres globaux</h2>
        </div>
        <GeofenceGlobalForm defaultRadius={mostCommon} strict={strict} />
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Rayon par site</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Personnalise par boutique : utile pour un site avec une grande
            terrasse ou un parking employés (rayon plus large).
          </p>
        </div>
        {sites.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun site actif.
          </div>
        ) : (
          <GeofencePerSiteList sites={sites} />
        )}
      </Card>
    </div>
  );
}
