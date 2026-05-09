import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "Onboarding",
    items: [
      { href: "/onboarding", label: "Suivi équipe", icon: "UserCheck" },
      { href: "/onboarding/templates", label: "Templates", icon: "FileText" },
    ],
  },
  {
    title: "Retour",
    items: [
      { href: "/rh", label: "Recrutement RH", icon: "Briefcase" },
      { href: "/planning/calendar", label: "Planning", icon: "CalendarDays" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
    ],
  },
];

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
