import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "GestiPlanning",
    items: [
      { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
      { href: "/planning/time-off", label: "Congés", icon: "CalendarOff" },
    ],
  },
  {
    title: "Retour",
    items: [
      { href: "/rh", label: "Recrutement RH", icon: "Briefcase" },
    ],
  },
];

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
