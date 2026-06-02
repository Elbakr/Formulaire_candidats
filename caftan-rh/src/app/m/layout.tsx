// Karim 2026-06-02 : layout dédié /m sans app-shell sidebar.
// Optimise pour raccourci iPhone (full-screen, safe-area, no header parent).

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CaftanRH Mobile",
  description: "Dashboard mobile CaftanRH — pointage, planning, actions rapides",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0b0b",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
