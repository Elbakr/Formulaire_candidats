import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "GestiPlanning",
    items: [
      { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays" },
      { href: "/planning/auto-drafts", label: "Drafts auto", icon: "Sparkles" },
      { href: "/planning/all-sites", label: "Vue ensemble", icon: "LayoutDashboard" },
      { href: "/planning/sites", label: "Sites", icon: "Building2" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
      { href: "/planning/quotas", label: "Quotas", icon: "Activity" },
      { href: "/planning/time-off", label: "Congés", icon: "CalendarOff" },
      { href: "/planning/swaps", label: "Échanges shifts", icon: "ArrowRightLeft" },
      { href: "/planning/reinforcement", label: "Renfort", icon: "LifeBuoy" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/chat", label: "Chat équipe", icon: "MessageSquare" },
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
