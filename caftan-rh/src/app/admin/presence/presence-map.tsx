"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type SitePin = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  presents_count: number;
};

type EmployeePin = {
  employee_id: string;
  full_name: string;
  site_id: string | null;
  site_code: string | null;
  site_color: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  in_at: string;
  out_of_zone: boolean;
};

function makeSiteIcon(code: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:6px;padding:3px 6px;font-weight:bold;font-size:11px;font-family:system-ui;box-shadow:0 1px 4px rgba(0,0,0,0.3);">${code}</div>`,
    iconSize: [28, 22],
    iconAnchor: [14, 11],
  });
}

function makeEmployeeIcon(color: string, outOfZone: boolean): L.DivIcon {
  const border = outOfZone ? "#dc2626" : "#fff";
  const animation = outOfZone
    ? "animation:pulse 1.5s ease-in-out infinite;"
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};border:2px solid ${border};border-radius:50%;width:14px;height:14px;${animation}box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
           <style>@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.7)}50%{box-shadow:0 0 0 10px rgba(220,38,38,0)}}</style>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ sites }: { sites: SitePin[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [sites, map]);
  return null;
}

export function PresenceMap({
  sites,
  employees,
}: {
  sites: SitePin[];
  employees: EmployeePin[];
}) {
  const center = useMemo<[number, number]>(() => {
    if (sites.length === 0) return [50.85, 4.35]; // Bruxelles fallback
    const lat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const lng = sites.reduce((a, s) => a + s.lng, 0) / sites.length;
    return [lat, lng];
  }, [sites]);

  const outOfZoneCount = employees.filter((e) => e.out_of_zone).length;

  return (
    <div className="rounded-md overflow-hidden border border-line relative">
      {outOfZoneCount > 0 ? (
        <div className="absolute top-2 left-2 z-[1000] rounded bg-danger text-white text-xs font-bold px-2 py-1 shadow">
          ⚠ {outOfZoneCount} hors zone
        </div>
      ) : null}
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: 420, width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FitBounds sites={sites} />
        {sites.map((s) => (
          <div key={s.id}>
            <Circle
              center={[s.lat, s.lng]}
              radius={s.radius_m}
              pathOptions={{
                color: s.color ?? "#666",
                fillColor: s.color ?? "#666",
                fillOpacity: 0.15,
                weight: 1.5,
              }}
            />
            <Marker
              position={[s.lat, s.lng]}
              icon={makeSiteIcon(s.code, s.color ?? "#666")}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{s.code} — {s.name}</div>
                  <div className="text-ink-3">Rayon géofence : {s.radius_m} m</div>
                  <div className="text-success font-bold">
                    {s.presents_count} en poste
                  </div>
                </div>
              </Popup>
            </Marker>
          </div>
        ))}
        {employees.map((e) => (
          <Marker
            key={e.employee_id}
            position={[e.lat, e.lng]}
            icon={makeEmployeeIcon(
              e.out_of_zone ? "#dc2626" : (e.site_color ?? "#22c55e"),
              e.out_of_zone,
            )}
          >
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-bold">{e.full_name}</div>
                <div>
                  {e.site_code ? (
                    <>Site : <span className="font-bold">{e.site_code}</span></>
                  ) : (
                    <span className="text-ink-3 italic">Pas de site</span>
                  )}
                </div>
                <div className="text-ink-3">
                  Pointé à {new Date(e.in_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
                  {e.accuracy_m ? ` · ±${Math.round(e.accuracy_m)}m` : ""}
                </div>
                {e.out_of_zone ? (
                  <div className="text-danger font-bold">⚠ Hors géofence du site</div>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
