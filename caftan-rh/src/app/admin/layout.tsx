import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/admin/cockpit", label: "Cockpit exécutif", icon: "LayoutDashboard" },
      { href: "/admin", label: "Vue d'ensemble", icon: "LayoutDashboard" },
      { href: "/admin/users", label: "Utilisateurs", icon: "Users" },
      { href: "/admin/departments", label: "Services", icon: "Building2" },
    ],
  },
  {
    title: "Pilotage",
    items: [
      { href: "/admin/payroll", label: "Paie (export)", icon: "FileBarChart" },
      { href: "/scoring", label: "Scoring équipe", icon: "FileBarChart" },
    ],
  },
  {
    title: "Intégrations",
    items: [
      { href: "/admin/integrations/gravity-forms", label: "Gravity Forms", icon: "Briefcase" },
    ],
  },
  {
    items: [
      { href: "/admin/settings", label: "Paramètres", icon: "Sliders" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
