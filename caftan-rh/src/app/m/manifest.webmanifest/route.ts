// Karim 2026-06-02 : manifest dédié au dashboard mobile /m.
// Permet l'installation comme PWA séparée sur iPhone (raccourci avec
// son propre titre + icône + start_url).

import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const manifest = {
    name: "CaftanRH Mobile",
    short_name: "CaftanRH",
    description: "Dashboard mobile CaftanRH — pointage, planning, actions",
    start_url: "/m",
    scope: "/m",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Planning", url: "/planning/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Employés", url: "/planning/employees", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Fiches paie", url: "/admin/payslips", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
