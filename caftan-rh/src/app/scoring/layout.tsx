import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "Scoring",
    items: [
      { href: "/scoring", label: "Leaderboard", icon: "FileBarChart" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
    ],
  },
  {
    title: "Retour",
    items: [
      { href: "/rh", label: "Recrutement RH", icon: "Briefcase" },
      { href: "/planning/calendar", label: "Planning", icon: "CalendarDays" },
    ],
  },
];

export default async function ScoringLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
