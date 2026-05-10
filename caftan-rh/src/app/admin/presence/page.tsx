import Link from "next/link";
import { Activity, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentlyIn } from "@/lib/clock";
import { PresenceLiveTable } from "./presence-table";

export default async function AdminPresencePage() {
  const supabase = await createClient();
  const [presents, { data: sitesRaw }] = await Promise.all([
    loadCurrentlyIn(),
    supabase
      .from("sites")
      .select("id, code, name, color, light_color, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  // Charge les selfie paths de l'entry "in" courante de chaque présent. La vue
  // clock_currently_in n'expose pas selfie_storage_path → on fait un lookup.
  const lastEntryIds = presents
    .map((p) => p.last_entry_id)
    .filter((id): id is string => !!id);
  const selfieByEntryId = new Map<string, string>();
  if (lastEntryIds.length > 0) {
    const { data: rows } = await supabase
      .from("clock_entries")
      .select("id, selfie_storage_path")
      .in("id", lastEntryIds)
      .not("selfie_storage_path", "is", null);
    for (const r of (rows ?? []) as Array<{ id: string; selfie_storage_path: string | null }>) {
      if (r.selfie_storage_path) selfieByEntryId.set(r.id, r.selfie_storage_path);
    }
  }
  const presentsWithSelfie = presents.map((p) => ({
    ...p,
    selfie_storage_path: selfieByEntryId.get(p.last_entry_id) ?? null,
  }));

  const sites = (sitesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
    light_color: string | null;
    sort_order: number;
  }>;

  const countBySite = new Map<string, number>();
  for (const p of presents) {
    if (p.site_id) countBySite.set(p.site_id, (countBySite.get(p.site_id) ?? 0) + 1);
  }
  const noSite = presents.filter((p) => !p.site_id).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-success" />
          Présence en direct
        </h1>
        <p className="text-sm text-ink-2">
          Qui est actuellement clocké-in. Mise à jour temps réel.
        </p>
      </div>

      {/* Compteurs par site */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {sites.map((s) => {
          const c = countBySite.get(s.id) ?? 0;
          return (
            <Link
              key={s.id}
              href={`/planning/sites/${s.code}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-all overflow-hidden">
                <div
                  className="px-3 py-2"
                  style={{ backgroundColor: s.light_color ?? "#f4f4f4" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex w-7 h-7 rounded items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: s.color ?? "#666" }}
                    >
                      {s.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 truncate">
                        {s.name}
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{c}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {noSite > 0 ? (
          <Card>
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-7 h-7 rounded items-center justify-center bg-surface-2 text-ink-2">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                    Sans site
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{noSite}</div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <PresenceLiveTable initial={presentsWithSelfie} sites={sites} />
    </div>
  );
}
