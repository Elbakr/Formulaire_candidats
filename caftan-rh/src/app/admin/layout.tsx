import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { getNavSections } from "@/lib/navigation";
import { readCity } from "@/lib/city";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["admin"]);
  const groups = getNavSections(profile.role, profile.permissions);
  const city = await readCity();
  return <AppShell groups={groups} user={profile} city={city}>{children}</AppShell>;
}
