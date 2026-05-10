import Link from "next/link";
import { Building2, MapPin, Users, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadSites, totalRequiredHours, type SiteNeed } from "@/lib/sites";

export default async function SitesOverviewPage() {
  await requireRole(["admin", "rh", "manager"]);
  const sites = await loadSites();
  const supabase = await createClient();

  // Tous les besoins par site en un seul appel.
  const { data: needsRaw } = await supabase
    .from("site_needs")
    .select("*")
    .in("site_id", sites.map((s) => s.id));
  const needs = (needsRaw ?? []) as SiteNeed[];
  const needsBySite = new Map<string, SiteNeed[]>();
  for (const n of needs) {
    const arr = needsBySite.get(n.site_id) ?? [];
    arr.push(n);
    needsBySite.set(n.site_id, arr);
  }

  // Effectif assigné par site (assignations actives).
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("site_id, employee_id")
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const assigns = (assignsRaw ?? []) as Array<{ site_id: string; employee_id: string }>;
  const assignsBySite = new Map<string, Set<string>>();
  for (const a of assigns) {
    const set = assignsBySite.get(a.site_id) ?? new Set();
    set.add(a.employee_id);
    assignsBySite.set(a.site_id, set);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-gold-dark" /> Sites Caftan Factory
          </h1>
          <p className="text-sm text-ink-2">
            6 boutiques · cliquer pour voir le planning hebdo + couverture besoins.
          </p>
        </div>
      </div>

      {sites.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-ink-3">
            Aucun site défini. Lance{" "}
            <code className="font-mono bg-surface-2 px-1 rounded">npm run seed:sites</code>{" "}
            pour seeder les 6 sites par défaut.
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map((s) => {
            const sNeeds = needsBySite.get(s.id) ?? [];
            const reqHours = totalRequiredHours(sNeeds);
            const reqHeadCount = sNeeds.reduce((m, n) => Math.max(m, n.headcount), 0);
            const assigned = assignsBySite.get(s.id)?.size ?? 0;
            return (
              <Link
                key={s.id}
                href={`/planning/sites/${s.code}`}
                className="block group"
              >
                <Card
                  className="h-full transition-all hover:shadow-md overflow-hidden"
                  style={{ borderTopColor: s.color ?? undefined, borderTopWidth: 4 }}
                >
                  <div
                    className="px-4 py-3 flex items-center gap-3"
                    style={{ backgroundColor: s.light_color ?? undefined }}
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-white text-lg shrink-0"
                      style={{ backgroundColor: s.color ?? "#666" }}
                    >
                      {s.abbr ?? s.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{s.name}</div>
                      <div className="text-xs text-ink-3 flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {s.city ?? "—"}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="font-mono font-bold text-base">{reqHours.toFixed(0)}h</div>
                      <div className="text-ink-3">requises/sem</div>
                    </div>
                    <div>
                      <div className="font-mono font-bold text-base">{reqHeadCount}</div>
                      <div className="text-ink-3">pic effectif</div>
                    </div>
                    <div>
                      <div className="font-mono font-bold text-base flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {assigned}
                      </div>
                      <div className="text-ink-3">assignés</div>
                    </div>
                  </div>
                  <div className="px-4 pb-3 text-[11px] text-ink-3 truncate">
                    {s.address ?? ""}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
