import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/manager", label: "Tableau de bord", icon: "LayoutDashboard" },
      { href: "/manager/candidates", label: "Mes candidats", icon: "Users" },
      { href: "/manager/calendar", label: "Mon agenda", icon: "Calendar" },
    ],
  },
  {
    title: "GestiPlanning",
    items: [
      { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
      { href: "/planning/time-off", label: "Congés", icon: "CalendarOff" },
      { href: "/onboarding", label: "Onboarding", icon: "UserCheck" },
    ],
  },
  {
    title: "Pilotage",
    items: [
      { href: "/scoring", label: "Scoring équipe", icon: "FileBarChart" },
      { href: "/scoring/weekly", label: "Notation hebdo", icon: "Star" },
      { href: "/manager/performance", label: "Performance magasin", icon: "TrendingUp" },
    ],
  },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
