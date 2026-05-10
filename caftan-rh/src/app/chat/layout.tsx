import { AppShell, type NavSection } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";

const sections: NavSection[] = [
  {
    title: "Messagerie",
    items: [
      { href: "/chat", label: "Toutes les conversations", icon: "MessageSquare" },
      { href: "/chat/new-dm", label: "Nouveau message", icon: "Mail" },
    ],
  },
  {
    title: "Retour",
    items: [
      { href: "/today", label: "Aujourd'hui", icon: "LayoutDashboard" },
    ],
  },
];

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
