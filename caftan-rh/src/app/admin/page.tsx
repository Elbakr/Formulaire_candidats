import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, Building2 } from "lucide-react";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [usersRes, jobsRes, deptsRes, appsRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("departments").select("id", { count: "exact", head: true }),
    supabase.from("applications").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Utilisateurs", value: usersRes.count ?? 0, href: "/admin/users", icon: Users },
    { label: "Offres", value: jobsRes.count ?? 0, href: "/rh/jobs", icon: Briefcase },
    { label: "Services", value: deptsRes.count ?? 0, href: "/admin/departments", icon: Building2 },
    { label: "Candidatures", value: appsRes.count ?? 0, href: "/rh/candidates", icon: Users },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Administration</h1>
        <p className="text-sm text-ink-2">Vue d'ensemble + gestion utilisateurs et paramètres.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-[var(--radius)] bg-surface border border-line p-4 hover:border-gold transition-colors"
          >
            <s.icon className="h-5 w-5 text-gold-dark" />
            <div className="text-2xl font-extrabold font-mono mt-2">{s.value}</div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-bold">Actions rapides</h2>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-3">
          <Button asChild variant="outline"><Link href="/admin/users">Gérer les utilisateurs et rôles</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/departments">Gérer les services</Link></Button>
          <Button asChild variant="outline"><Link href="/rh/jobs">Gérer les offres</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/settings">Paramètres organisation</Link></Button>
        </div>
      </Card>
    </div>
  );
}
