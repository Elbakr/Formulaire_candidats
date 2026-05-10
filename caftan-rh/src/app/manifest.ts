import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CaftanRH",
    short_name: "CaftanRH",
    description: "Plateforme RH et planning Caftan Factory",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#18181b",
    orientation: "portrait",
    categories: ["business", "productivity"],
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      {
        name: "Planning",
        url: "/planning/calendar",
        icons: [{ src: "/icons/shortcut-planning.png", sizes: "96x96", type: "image/png" }],
      },
      { name: "Candidats", url: "/rh/candidates" },
      { name: "Pointage", url: "/me/clock" },
    ],
  };
}
