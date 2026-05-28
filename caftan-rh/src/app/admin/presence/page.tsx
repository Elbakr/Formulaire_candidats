import Link from "next/link";
import { Activity, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentlyIn } from "@/lib/clock";
import { haversineKm } from "@/lib/distance";
import { PresenceLiveTable } from "./presence-table";
import { ExpectedPresentPanel } from "./expected-present-panel";
// Next.js 16 interdit ssr:false dans un Server Component -> on passe par un
// wrapper Client Component qui fait le dynamic import.
import { PresenceMapLoader } from "./presence-map-loader";

export default async function AdminPresencePage() {
  const supabase = await createClient();
  // Karim 2026-05-25 : filtre par ville (cookie). BXL = A/B/D/E, Anvers = C/F.
  // MAIS le panneau "Vue globale" en haut affiche TOUS les sites A-F
  // (Karim 2026-05-25 v2 : visibilite cruciale multi-villes).
  const { readCity, siteCodesForCity } = await import("@/lib/city");
  const city = await readCity();
  const cityCodes = siteCodesForCity(city);
  const [presentsRaw, { data: sitesAllRaw }] = await Promise.all([
    loadCurrentlyIn(),
    supabase
      .from("sites")
      .select("id, code, name, color, light_color, sort_order, lat, lng, geofence_radius_m")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  // Tous les sites (BXL + Anvers) pour la vue globale
  const sitesAll = (sitesAllRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
    light_color: string | null;
    sort_order: number;
    lat: number | string | null;
    lng: number | string | null;
    geofence_radius_m: number | null;
  }>;
  // Compteur GLOBAL (toutes villes) pour le panneau d ensemble
  const globalCountBySite = new Map<string, number>();
  for (const p of presentsRaw) {
    if (p.site_id) globalCountBySite.set(p.site_id, (globalCountBySite.get(p.site_id) ?? 0) + 1);
  }
  const globalNoSite = presentsRaw.filter((p) => !p.site_id).length;
  // Filtre les presents par site de la ville (ou sans site) - pour la vue detail
  const presents = presentsRaw.filter((p) =>
    !p.site_code || cityCodes.includes(p.site_code as string),
  );
  const sitesRaw = sitesAll.filter((s) => cityCodes.includes(s.code));

  // Charge les selfie paths + coords GPS de l'entry "in" courante de chaque
  // present. La vue clock_currently_in n'expose ni selfie_storage_path ni
  // geo_lat/lng -> on fait un lookup en une seule requete.
  const lastEntryIds = presents
    .map((p) => p.last_entry_id)
    .filter((id): id is string => !!id);
  const selfieByEntryId = new Map<string, string>();
  const geoByEntryId = new Map<
    string,
    { lat: number; lng: number; accuracy_m: number | null }
  >();
  if (lastEntryIds.length > 0) {
    const { data: rows } = await supabase
      .from("clock_entries")
      .select("id, selfie_storage_path, geo_lat, geo_lng, geo_accuracy_m")
      .in("id", lastEntryIds);
    for (const r of (rows ?? []) as Array<{
      id: string;
      selfie_storage_path: string | null;
      geo_lat: number | null;
      geo_lng: number | null;
      geo_accuracy_m: number | null;
    }>) {
      if (r.selfie_storage_path) selfieByEntryId.set(r.id, r.selfie_storage_path);
      if (r.geo_lat != null && r.geo_lng != null) {
        geoByEntryId.set(r.id, {
          lat: Number(r.geo_lat),
          lng: Number(r.geo_lng),
          accuracy_m: r.geo_accuracy_m != null ? Number(r.geo_accuracy_m) : null,
        });
      }
    }
  }
  const presentsWithSelfie = presents.map((p) => ({
    ...p,
    selfie_storage_path: selfieByEntryId.get(p.last_entry_id) ?? null,
  }));

  const sites = sitesRaw;
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const countBySite = new Map<string, number>();
  for (const p of presents) {
    if (p.site_id) countBySite.set(p.site_id, (countBySite.get(p.site_id) ?? 0) + 1);
  }
  const noSite = presents.filter((p) => !p.site_id).length;

  // Donnees pour la carte : sites avec coords + employes pointes avec GPS
  const sitesForMap = sites
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      color: s.color,
      lat: Number(s.lat),
      lng: Number(s.lng),
      radius_m: s.geofence_radius_m ?? 100,
      presents_count: countBySite.get(s.id) ?? 0,
    }));
  // Karim 2026-05-28 : panneau "Devraient etre presents" - shifts today sans IN.
  // Permet de pointer en 1-clic les employes presents physiquement mais sans
  // pointage Tuya (slot non mappe, oubli, panne).
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: shiftsTodayRaw } = await supabase
    .from("shifts")
    .select("id, employee_id, site_id, start_time, end_time")
    .eq("date", todayISO);
  type ShiftRow = { id: string; employee_id: string; site_id: string | null; start_time: string; end_time: string };
  const shiftsToday = (shiftsTodayRaw ?? []) as ShiftRow[];
  const presentEmpIds = new Set(presentsRaw.map((p) => p.employee_id));
  const expectedNotPresent: Array<{ employee_id: string; full_name: string; site_code: string | null; site_id: string | null; start_time: string; end_time: string }> = [];
  if (shiftsToday.length > 0) {
    const empIds = [...new Set(shiftsToday.map((s) => s.employee_id))].filter((id) => !presentEmpIds.has(id));
    if (empIds.length > 0) {
      const { data: empsRaw } = await supabase
        .from("employees")
        .select("id, full_name, status")
        .in("id", empIds)
        .eq("status", "active");
      const empById = new Map(((empsRaw ?? []) as Array<{ id: string; full_name: string; status: string }>).map((e) => [e.id, e]));
      for (const sh of shiftsToday) {
        if (presentEmpIds.has(sh.employee_id)) continue;
        const emp = empById.get(sh.employee_id);
        if (!emp) continue;
        const site = sh.site_id ? sitesAll.find((s) => s.id === sh.site_id) : null;
        // Filtre par ville courante (mais pas pour scope all)
        if (site && !cityCodes.includes(site.code)) continue;
        expectedNotPresent.push({
          employee_id: sh.employee_id,
          full_name: emp.full_name,
          site_code: site?.code ?? null,
          site_id: sh.site_id,
          start_time: sh.start_time,
          end_time: sh.end_time,
        });
      }
    }
  }
  // Dedup par employee (un emp peut avoir 2 shifts)
  const expectedUnique = Array.from(
    new Map(expectedNotPresent.map((e) => [e.employee_id, e])).values(),
  );

  const employeesForMap = presents
    .filter((p) => geoByEntryId.has(p.last_entry_id))
    .map((p) => {
      const geo = geoByEntryId.get(p.last_entry_id)!;
      const site = p.site_id ? siteById.get(p.site_id) : null;
      let outOfZone = false;
      if (site && site.lat != null && site.lng != null) {
        const km = haversineKm(
          { lat: geo.lat, lng: geo.lng },
          { lat: Number(site.lat), lng: Number(site.lng) },
        );
        const radiusKm = (site.geofence_radius_m ?? 100) / 1000;
        if (km > radiusKm) outOfZone = true;
      }
      return {
        employee_id: p.employee_id,
        full_name: p.full_name ?? "?",
        site_id: p.site_id,
        site_code: p.site_code,
        site_color: p.site_color,
        lat: geo.lat,
        lng: geo.lng,
        accuracy_m: geo.accuracy_m,
        in_at: p.clock_in_at,
        out_of_zone: outOfZone,
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-success" />
            Présence en direct
          </h1>
          <p className="text-sm text-ink-2">
            Qui est actuellement clocké-in. Mise à jour temps réel.
          </p>
        </div>
        <Link
          href="/admin/heures-prestees"
          className="text-xs px-3 py-1.5 rounded-md border border-gold bg-gold/10 text-gold-dark font-bold hover:bg-gold/20"
        >
          Heures prestées →
        </Link>
      </div>

      {/* Vue globale tous sites (BXL + Anvers) - Karim 2026-05-25 */}
      <Card>
        <div className="px-3 py-2 border-b border-line flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gold-dark" />
          <h2 className="font-bold text-sm">Vue globale — tous les sites</h2>
          <span className="text-[10px] text-ink-3 ml-auto">
            Total : <span className="font-bold text-ink-1">{presentsRaw.length}</span> employé(s) pointé(s)
          </span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-line">
          {sitesAll.map((s) => {
            const c = globalCountBySite.get(s.id) ?? 0;
            const isCurrentCity = cityCodes.includes(s.code);
            return (
              <Link
                key={s.id}
                href={`/planning/sites/${s.code}`}
                className={`block px-2 py-3 bg-surface hover:bg-surface-2 transition-colors ${
                  isCurrentCity ? "" : "opacity-70"
                }`}
                title={isCurrentCity ? `${s.name} (ville courante)` : `${s.name} (autre ville)`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: s.color ?? "#666" }}
                  >
                    {s.code}
                  </span>
                  <div className="text-xl font-bold tabular-nums">{c}</div>
                </div>
                <div className="text-center text-[9px] uppercase tracking-wider text-ink-3 truncate mt-0.5">
                  {s.name}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Compteurs par site (ville courante) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {sites.map((s) => {
          const c = countBySite.get(s.id) ?? 0;
          return (
            <Link
              key={s.id}
              href={`/planning/sites/${s.code}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-all overflow-hidden">
                <div
                  className="px-3 py-2"
                  style={{ backgroundColor: s.light_color ?? "#f4f4f4" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex w-7 h-7 rounded items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: s.color ?? "#666" }}
                    >
                      {s.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 truncate">
                        {s.name}
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{c}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {noSite > 0 ? (
          <Card>
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-7 h-7 rounded items-center justify-center bg-surface-2 text-ink-2">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                    Sans site
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{noSite}</div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      {sitesForMap.length > 0 ? (
        <Card>
          <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gold-dark" />
              <h2 className="font-bold text-sm">Carte temps réel</h2>
            </div>
            <div className="text-[11px] text-ink-3">
              Cercle = rayon géofence. Pin rouge clignotant = employé hors zone.
            </div>
          </div>
          <PresenceMapLoader sites={sitesForMap} employees={employeesForMap} />
        </Card>
      ) : null}

      <PresenceLiveTable initial={presentsWithSelfie} sites={sites} />

      <ExpectedPresentPanel expected={expectedUnique} />
    </div>
  );
}
