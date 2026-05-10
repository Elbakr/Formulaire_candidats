import { AppShell, type NavSection } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const locale = await getLocale();

  const sections: NavSection[] = [
    {
      title: t("me.nav.section_recrutement", locale),
      items: [
        { href: "/me", label: t("me.nav.applications", locale), icon: "LayoutDashboard" },
        { href: "/me/documents", label: t("me.nav.documents", locale), icon: "FileText" },
        { href: "/me/messages", label: t("me.nav.messages", locale), icon: "MessageSquare" },
      ],
    },
    {
      title: t("me.nav.section_poste", locale),
      items: [
        { href: "/me/today", label: t("me.nav.today", locale), icon: "LayoutDashboard" },
        { href: "/me/clock", label: t("me.nav.clock", locale), icon: "Clock" },
        { href: "/me/planning", label: t("me.nav.planning", locale), icon: "CalendarDays" },
        { href: "/me/availability", label: t("me.nav.availability", locale), icon: "Clock" },
        { href: "/me/time-off", label: t("me.nav.time_off", locale), icon: "CalendarOff" },
        { href: "/me/swaps", label: t("me.nav.swaps", locale), icon: "ArrowRightLeft" },
        { href: "/me/absence", label: t("me.nav.absence", locale), icon: "AlertCircle" },
        { href: "/me/onboarding", label: t("me.nav.onboarding", locale), icon: "FileText" },
        { href: "/me/scoring", label: t("me.nav.scoring", locale), icon: "FileBarChart" },
        { href: "/me/my-bonus", label: locale === "nl" ? "Mijn premies" : "Mes primes", icon: "Star" },
        { href: "/me/my-clients", label: locale === "nl" ? "Mijn VIP-klanten" : "Mes clientes VIP", icon: "Users" },
      ],
    },
    {
      title: t("me.nav.section_communication", locale),
      items: [
        { href: "/chat", label: t("me.nav.chat", locale), icon: "MessageSquare" },
      ],
    },
    {
      items: [{ href: "/me/profile", label: t("me.nav.profile", locale), icon: "User" }],
    },
  ];

  return <AppShell sections={sections} user={profile}>{children}</AppShell>;
}
