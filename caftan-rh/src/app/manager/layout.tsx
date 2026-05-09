import { LayoutDashboard, Users, Calendar } from "lucide-react";
import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/manager", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/manager/candidates", label: "Mes candidats", icon: Users },
      { href: "/manager/calendar", label: "Mon agenda", icon: Calendar },
    ],
  },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return (
    <AppShell sections={sections} user={profile}>
      {children}
    </AppShell>
  );
}
