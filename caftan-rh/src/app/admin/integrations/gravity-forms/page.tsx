import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { GfSettingsForm } from "./form";
import { GfSyncButton } from "./sync-button";
import { formatDateTime } from "@/lib/utils";

export default async function GravityFormsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("gf_settings").select("*").eq("id", 1).single();

  const settings = (data as unknown as {
    wp_url: string;
    ck: string | null;
    cs: string | null;
    form_id: number;
    field_map: Record<string, string>;
    last_synced_at: string | null;
    last_sync_count: number;
    enabled: boolean;
  }) ?? {
    wp_url: "https://caftanfactory.com",
    ck: null,
    cs: null,
    form_id: 4,
    field_map: {},
    last_synced_at: null,
    last_sync_count: 0,
    enabled: false,
  };

  const { count: gfCount } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .not("gf_entry_id", "is", null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gravity Forms — Intégration</h1>
        <p className="text-sm text-ink-2">
          Importe les candidatures de ton site WordPress (Gravity Forms) automatiquement.
        </p>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold mb-3">Statut</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Activé" value={settings.enabled ? "Oui" : "Non"} />
            <Stat label="Dernière sync" value={settings.last_synced_at ? formatDateTime(settings.last_synced_at) : "Jamais"} />
            <Stat label="Dernier batch" value={`${settings.last_sync_count} entrées`} />
            <Stat label="Importés total" value={`${gfCount ?? 0} candidats`} />
          </div>
          <div className="mt-4">
            <GfSyncButton disabled={!settings.enabled || !settings.ck || !settings.cs} />
          </div>
        </div>
        <GfSettingsForm initial={settings} />
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
