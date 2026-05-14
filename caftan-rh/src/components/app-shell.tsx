"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LogOut, Settings, Menu, X,
  LayoutDashboard, Users, KanbanSquare, Briefcase, Mail, FileBarChart,
  Calendar, FileText, MessageSquare, User, Building2, Sliders,
  CalendarDays, UserCheck, CalendarOff, Clock, Sparkles, AlertTriangle,
  Activity, ShoppingBag, ArrowRightLeft, AlertCircle, Megaphone,
  Star, RefreshCw, TrendingUp, LifeBuoy, Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, ROLE_LABELS } from "@/lib/config";
import { Button } from "./ui/button";
import { NameAvatar } from "./ui/avatar";
import { logoutAction } from "@/app/login/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { NotificationsBell } from "./notifications-bell";
import { NotificationListener } from "./notification-listener";
import { SoundToggle } from "./sound-toggle";
import { LangToggle } from "./lang-toggle";
import { ViewerRoleProvider } from "./user-role-context";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, KanbanSquare, Briefcase, Mail, FileBarChart,
  Calendar, FileText, MessageSquare, User, Building2, Sliders,
  CalendarDays, UserCheck, CalendarOff, Clock, Sparkles, AlertTriangle,
  Activity, ShoppingBag, ArrowRightLeft, AlertCircle, Megaphone,
  Star, RefreshCw, TrendingUp, LifeBuoy, Stethoscope,
};

export type NavIconName = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
};

export type NavSection = { title?: string; items: NavItem[] };

export function AppShell({
  sections,
  user,
  children,
}: {
  sections: NavSection[];
  user: { id: string; full_name: string | null; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const displayName = user.full_name ?? user.email;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <ViewerRoleProvider role={user.role} profileId={user.id}>
    <div className="flex flex-col min-h-screen min-h-screen-mobile">
      <NotificationListener profileId={user.id} />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/95 backdrop-blur-xl text-white pt-safe">
        <div className="flex items-center gap-2 px-3 sm:px-5 py-3 px-safe">
          <button
            type="button"
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden flex items-center justify-center h-9 w-9 -ml-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link href="/" className="text-gold font-bold uppercase tracking-[0.1em] text-xs whitespace-nowrap">
            {BRAND.name}
          </Link>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-white/50 font-bold">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <SoundToggle />
            <NotificationsBell userId={user.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10 transition-colors">
                  <NameAvatar name={displayName} className="h-6 w-6 rounded-md text-[10px]" />
                  <span className="font-semibold max-w-[140px] truncate hidden sm:inline">{displayName}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/me/profile" className="cursor-pointer">
                    <Settings className="h-3.5 w-3.5" /> Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  onSelect={() => logoutAction()}
                  className="cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" /> Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Mobile drawer overlay */}
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
            className="md:hidden fixed inset-0 top-[calc(env(safe-area-inset-top)+49px)] z-30 bg-ink/40 backdrop-blur-sm"
          />
        ) : null}

        <aside
          className={cn(
            "shrink-0 border-r border-line bg-surface px-2 py-3 overflow-y-auto scrollbar-thin scroll-smooth-touch pb-safe",
            // Desktop: in-flow sticky sidebar
            "md:w-[220px] md:sticky md:top-[calc(env(safe-area-inset-top)+49px)] md:h-[calc(100dvh-49px-env(safe-area-inset-top))] md:translate-x-0 md:block",
            // Mobile: off-canvas drawer
            "fixed top-[calc(env(safe-area-inset-top)+49px)] left-0 bottom-0 w-[260px] z-40 transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sections.map((s, i) => (
            <div key={i}>
              {s.title ? (
                <div className="px-2 mt-3 mb-1 text-[10px] font-bold tracking-[0.12em] uppercase text-ink-3">
                  {s.title}
                </div>
              ) : null}
              {s.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 md:py-1.5 rounded-md text-sm font-medium border-[1.5px] border-transparent mb-0.5",
                      "transition-colors",
                      active
                        ? "bg-gold-light border-gold text-gold-dark font-bold"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto bg-gold text-white rounded-full px-1.5 text-[10px] font-bold min-w-[18px] text-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        <main className="flex-1 overflow-x-hidden p-3 sm:p-4 md:p-6 w-full min-w-0 pb-safe">{children}</main>
      </div>
    </div>
    </ViewerRoleProvider>
  );
}

export function MissingEnvBanner() {
  return (
    <div className="mb-4 rounded-lg border border-warn bg-warn-light p-3 text-warn text-xs font-semibold">
      ⚠ Variables Supabase non configurées dans <code>.env.local</code>. La connexion à la base échoue tant que tu n'as pas ajouté <code>NEXT_PUBLIC_SUPABASE_URL</code> et <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
    </div>
  );
}
