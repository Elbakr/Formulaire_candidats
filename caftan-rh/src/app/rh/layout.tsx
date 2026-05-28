import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { getNavSections } from "@/lib/navigation";
import { readCity } from "@/lib/city";

export default async function RhLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin", "rh"]);
  const groups = getNavSections(profile.role);
  const city = await readCity();
  return <AppShell groups={groups} user={profile} city={city}>{children}</AppShell>;
}
