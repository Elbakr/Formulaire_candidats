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
      { href: "/admin/presence", label: "Présence live", icon: "Activity" },
      { href: "/admin/analytics", label: "Analytics", icon: "FileBarChart" },
      { href: "/admin/documents", label: "Documents", icon: "FileText" },
      { href: "/admin/payroll", label: "Paie & exports", icon: "FileText" },
      { href: "/scoring", label: "Scoring équipe", icon: "FileBarChart" },
      { href: "/scoring/weekly", label: "Notation hebdo", icon: "Star" },
      { href: "/admin/cdd-renewals", label: "Renouvellements CDD", icon: "RefreshCw" },
      { href: "/admin/pre-interview", label: "Pré-entretiens", icon: "Sparkles" },
      { href: "/onboarding", label: "Onboarding", icon: "UserCheck" },
      { href: "/admin/activity", label: "Journal d'activité", icon: "FileBarChart" },
      { href: "/admin/ai-audit", label: "AI audit", icon: "Sparkles" },
      { href: "/admin/anomalies", label: "Anomalies", icon: "AlertTriangle" },
      { href: "/admin/digest", label: "Digest IA", icon: "Sparkles" },
      { href: "/admin/holidays", label: "Jours fériés & fermetures", icon: "Calendar" },
      { href: "/admin/seasonal", label: "Saisonnalités", icon: "Sparkles" },
      { href: "/admin/overtime-audit", label: "Audit heures sup", icon: "Activity" },
      { href: "/admin/help/planning", label: "Aide planning", icon: "FileText" },
      { href: "/admin/bonus", label: "Primes & concours", icon: "Star" },
      { href: "/admin/vip-clients", label: "Clientes VIP", icon: "Users" },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/admin/broadcasts", label: "Annonces", icon: "Megaphone" },
      { href: "/admin/absences", label: "Absences imprévues", icon: "AlertCircle" },
    ],
  },
  {
    title: "Intégrations",
    items: [
      { href: "/admin/integrations/gravity-forms", label: "Gravity Forms", icon: "Briefcase" },
      { href: "/admin/integrations/whatsapp", label: "WhatsApp", icon: "MessageSquare" },
    ],
  },
  {
    items: [
      { href: "/admin/debug/push", label: "Diagnostic Push", icon: "Stethoscope" },
      { href: "/admin/settings", label: "Paramètres", icon: "Sliders" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin"]);
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
