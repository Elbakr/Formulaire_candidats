import { LayoutDashboard, FileText, MessageSquare, User } from "lucide-react";
import { AppShell, type NavSection } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";

const sections: NavSection[] = [
  {
    items: [
      { href: "/me", label: "Mes candidatures", icon: LayoutDashboard },
      { href: "/me/documents", label: "Mes documents", icon: FileText },
      { href: "/me/messages", label: "Messages", icon: MessageSquare },
      { href: "/me/profile", label: "Mon profil", icon: User },
    ],
  },
];

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <AppShell sections={sections} user={profile}>
      {children}
    </AppShell>
  );
}
