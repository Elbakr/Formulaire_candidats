import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "Vue 360°",
    items: [
      { href: "/rh/candidates", label: "Candidats", icon: "Users" },
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

export default async function Profile360Layout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
