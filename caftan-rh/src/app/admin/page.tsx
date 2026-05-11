import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, Building2, Radio } from "lucide-react";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [usersRes, jobsRes, deptsRes, appsRes, presenceRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("departments").select("id", { count: "exact", head: true }),
    supabase.from("applications").select("id", { count: "exact", head: true }),
    supabase
      .from("clock_currently_in")
      .select("employee_id, site_code, site_color, site_name, full_name, clock_in_at"),
  ]);
  const presence = (presenceRes.data ?? []) as Array<{
    employee_id: string;
    site_code: string | null;
    site_color: string | null;
    site_name: string | null;
    full_name: string | null;
    clock_in_at: string;
  }>;
  const presenceBySite = new Map<string, typeof presence>();
  for (const p of presence) {
    const key = p.site_code ?? "—";
    const arr = presenceBySite.get(key) ?? [];
    arr.push(p);
    presenceBySite.set(key, arr);
  }

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
        <div className="p-4 border-b border-line flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-success animate-pulse" />
            <h2 className="font-bold">
              Présence en direct ·{" "}
              <span className="text-success">{presence.length}</span> en poste
            </h2>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/presence">Vue complète →</Link>
          </Button>
        </div>
        {presence.length === 0 ? (
          <div className="p-4 text-sm text-ink-3 italic">Personne n'est pointé pour le moment.</div>
        ) : (
          <div className="p-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[...presenceBySite.entries()].map(([code, ppl]) => (
              <div key={code} className="rounded border border-line p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                    style={{ backgroundColor: ppl[0]?.site_color ?? "#666" }}
                  >
                    {code}
                  </span>
                  <span className="text-[11px] text-ink-3">{ppl[0]?.site_name ?? "—"}</span>
                  <span className="ml-auto text-[11px] font-bold text-success">{ppl.length}</span>
                </div>
                <ul className="text-xs space-y-0.5">
                  {ppl.map((p) => (
                    <li key={p.employee_id} className="flex items-center gap-1.5 text-ink-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                      <span className="truncate">{p.full_name ?? "?"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

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
