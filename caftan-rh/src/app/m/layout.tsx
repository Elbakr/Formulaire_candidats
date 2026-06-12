// Karim 2026-06-02 : layout dédié /m sans app-shell sidebar.
// Optimisé pour raccourci iPhone (full-screen, safe-area, PWA standalone).

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CaftanRH Mobile",
  description: "Dashboard mobile CaftanRH — pointage, planning, actions rapides",
  // Karim 2026-06-02 : manifest dédié /m pour raccourci iPhone séparé
  // (s'ajoute en standalone, icône maison, splash screen).
  manifest: "/m/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // Karim 2026-06-12 : barre d'etat claire (l'ecran /m est verrouille en theme clair).
    statusBarStyle: "default",
    title: "CaftanRH",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "CaftanRH",
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Karim 2026-06-12 : theme clair uniquement (pas de variante sombre — l'app n'a
  // pas de theme sombre, le mode sombre iPhone rendait /m illisible).
  themeColor: "#f8fafc",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  // color-scheme: light force le rendu clair quelle que soit la preference systeme.
  return <div style={{ colorScheme: "light" }}>{children}</div>;
}
