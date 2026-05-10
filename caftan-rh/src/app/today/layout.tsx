import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/today", label: "Aujourd'hui", icon: "LayoutDashboard" },
      { href: "/admin/cockpit", label: "Cockpit", icon: "LayoutDashboard" },
      { href: "/planning/calendar", label: "Planning", icon: "CalendarDays" },
    ],
  },
  {
    title: "Recrutement",
    items: [
      { href: "/rh/candidates", label: "Candidats", icon: "Users" },
      { href: "/rh/messages", label: "Messagerie email", icon: "Mail" },
      { href: "/rh/inbox", label: "Inbox IA", icon: "FileBarChart" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/chat", label: "Chat équipe", icon: "MessageSquare" },
      { href: "/requests", label: "Demandes équipe", icon: "ShoppingBag" },
    ],
  },
];

export default async function TodayLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
