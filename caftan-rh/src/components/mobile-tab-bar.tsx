"use client";

// Karim 2026-06-13 : barre d'onglets MOBILE en bas d'écran (< md). Donne à l'app
// un vrai look "application" : 4 raccourcis essentiels + "Plus" qui rouvre le
// menu complet (drawer de l'AppShell). Masquée sur desktop (la sidebar reste).
// Thème clair uniquement (pas de dark:). Cibles tactiles >= 56px.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, CalendarDays, Briefcase, Clock, UserCheck, MessageSquare, Menu,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileTab } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  Home, CalendarDays, Briefcase, Clock, UserCheck, MessageSquare, Menu,
};

function isActive(pathname: string, href?: string): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileTabBar({
  tabs,
  onMore,
}: {
  tabs: MobileTab[];
  onMore: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-line pb-safe px-safe"
    >
      <div className="flex items-stretch">
        {tabs.map((t, i) => {
          const Icon = ICONS[t.icon] ?? Home;
          const active = isActive(pathname, t.href);
          const cls = cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5",
            "text-[10px] font-semibold active:scale-95 transition-transform",
            active ? "text-gold-dark" : "text-ink-3",
          );
          if (t.more || !t.href) {
            return (
              <button key={`more-${i}`} type="button" onClick={onMore} className={cls} aria-label="Plus de menus">
                <Icon className="h-[22px] w-[22px]" />
                <span>{t.label}</span>
              </button>
            );
          }
          return (
            <Link key={t.href} href={t.href} className={cls} aria-current={active ? "page" : undefined}>
              <Icon className="h-[22px] w-[22px]" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
