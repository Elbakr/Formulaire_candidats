import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/today", label: "Aujourd'hui", icon: "LayoutDashboard" },
      { href: "/requests", label: "Demandes équipe", icon: "ShoppingBag" },
      { href: "/chat", label: "Chat", icon: "MessageSquare" },
    ],
  },
];

export default async function RequestsLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
