"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, LogOut, Settings } from "lucide-react";
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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export type NavSection = { title?: string; items: NavItem[] };

export function AppShell({
  sections,
  user,
  children,
}: {
  sections: NavSection[];
  user: { full_name: string | null; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const displayName = user.full_name ?? user.email;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/95 backdrop-blur-xl text-white">
        <div className="flex items-center gap-3 px-5 py-3">
          <Link href="/" className="text-gold font-bold uppercase tracking-[0.1em] text-xs whitespace-nowrap">
            {BRAND.name}
          </Link>
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10 transition-colors">
                  <NameAvatar name={displayName} className="h-6 w-6 rounded-md text-[10px]" />
                  <span className="font-semibold max-w-[140px] truncate">{displayName}</span>
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
        <aside className="w-[220px] shrink-0 border-r border-line bg-surface px-2 py-3 sticky top-[49px] h-[calc(100vh-49px)] overflow-y-auto scrollbar-thin">
          {sections.map((s, i) => (
            <div key={i}>
              {s.title ? (
                <div className="px-2 mt-3 mb-1 text-[10px] font-bold tracking-[0.12em] uppercase text-ink-3">
                  {s.title}
                </div>
              ) : null}
              {s.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium border-[1.5px] border-transparent mb-0.5",
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

        <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function MissingEnvBanner() {
  return (
    <div className="mb-4 rounded-lg border border-warn bg-warn-light p-3 text-warn text-xs font-semibold">
      ⚠ Variables Supabase non configurées dans <code>.env.local</code>. La connexion à la base échoue tant que tu n'as pas ajouté <code>NEXT_PUBLIC_SUPABASE_URL</code> et <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
    </div>
  );
}
