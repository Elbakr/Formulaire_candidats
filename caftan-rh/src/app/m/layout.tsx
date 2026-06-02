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
    statusBarStyle: "black-translucent",
    title: "CaftanRH",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
