import { LayoutDashboard, Users, KanbanSquare, Briefcase, Mail, FileBarChart } from "lucide-react";
import { AppShell, type NavSection } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/rh", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    title: "Recrutement",
    items: [
      { href: "/rh/candidates", label: "Candidats", icon: Users },
      { href: "/rh/pipeline", label: "Pipeline", icon: KanbanSquare },
      { href: "/rh/jobs", label: "Offres", icon: Briefcase },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/rh/messages", label: "Messagerie", icon: Mail },
      { href: "/rh/reports", label: "Rapports", icon: FileBarChart },
    ],
  },
];

export default async function RhLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh"]);
  return (
    <AppShell sections={sections} user={profile}>
      {children}
    </AppShell>
  );
}
