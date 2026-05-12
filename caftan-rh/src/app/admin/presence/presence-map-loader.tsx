"use client";

// Wrapper Client Component pour charger PresenceMap (Leaflet) en ssr:false.
// Next.js 16 interdit `ssr: false` dans next/dynamic appele depuis un Server
// Component -- ce loader contourne en faisant l'import cote client.

import dynamic from "next/dynamic";

const PresenceMap = dynamic(
  () => import("./presence-map").then((m) => m.PresenceMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] rounded-md border border-line bg-surface-2 flex items-center justify-center text-sm text-ink-3">
        Chargement de la carte...
      </div>
    ),
  },
);

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

export function PresenceMapLoader(props: {
  sites: SitePin[];
  employees: EmployeePin[];
}) {
  return <PresenceMap {...props} />;
}
