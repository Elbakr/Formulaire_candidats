import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  { items: [{ href: "/rh", label: "Tableau de bord", icon: "LayoutDashboard" }] },
  {
    title: "Recrutement",
    items: [
      { href: "/rh/candidates", label: "Candidats", icon: "Users" },
      { href: "/rh/pipeline", label: "Pipeline", icon: "KanbanSquare" },
      { href: "/rh/jobs", label: "Offres", icon: "Briefcase" },
    ],
  },
  {
    title: "GestiPlanning",
    items: [
      { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
      { href: "/planning/time-off", label: "Congés", icon: "CalendarOff" },
    ],
  },
  {
    title: "Pilotage",
    items: [
      { href: "/scoring", label: "Scoring équipe", icon: "FileBarChart" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/rh/messages", label: "Messagerie", icon: "Mail" },
      { href: "/rh/templates", label: "Templates emails", icon: "FileText" },
      { href: "/rh/reports", label: "Rapports", icon: "FileBarChart" },
    ],
  },
];

export default async function RhLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
