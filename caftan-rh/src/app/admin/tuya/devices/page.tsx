import Link from "next/link";
import { ArrowLeft, Fingerprint, Lock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DevicesTable } from "./devices-table";

type SiteRow = { id: string; code: string; name: string };

type DeviceRow = {
  tuya_device_id: string;
  tuya_device_name: string | null;
  category: string | null;
  product_name: string | null;
  site_id: string | null;
  fallback_for_site_ids: string[] | null;
  is_pointage: boolean;
  is_active: boolean;
  online: boolean | null;
  last_seen_at: string | null;
  notes: string | null;
};

export default async function AdminTuyaDevicesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: devicesRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("tuya_devices")
      .select(
        "tuya_device_id, tuya_device_name, category, product_name, site_id, fallback_for_site_ids, is_pointage, is_active, online, last_seen_at, notes",
      )
      .order("is_pointage", { ascending: false })
      .order("is_active", { ascending: false })
      .order("tuya_device_name"),
    supabase
      .from("sites")
      .select("id, code, name")
      .order("code"),
  ]);

  const devices = (devicesRaw ?? []) as DeviceRow[];
  const sites = (sitesRaw ?? []) as SiteRow[];

  const pointage = devices.filter((d) => d.is_pointage);
  const others = devices.filter((d) => !d.is_pointage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-gold-dark" />
            Terminaux Tuya
          </h1>
          <p className="text-sm text-ink-2">
            Pointage biométrique : mappe chaque terminal à un site. Les empreintes restent sur le terminal, seul l'identifiant Tuya et le timestamp sont stockés.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/logs">Logs</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/users">Empreintes</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour admin
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-emerald-600" />
              Terminaux pointage CaftanRH ({pointage.length})
            </h2>
            <p className="text-[11px] text-ink-3 mt-0.5">
              Source primaire du pointage. Chaque employé doit avoir 2 empreintes enrôlées : "Nom IN" et "Nom OUT".
            </p>
          </div>
        </div>
        {pointage.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun terminal pointage configuré.
          </div>
        ) : (
          <DevicesTable devices={pointage} sites={sites} mode="pointage" />
        )}
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-ink-3" />
            Autres terminaux ({others.length})
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            SmartLocks et terminaux d'accès hors pointage CaftanRH. Gardés en base pour usage futur (bureau, stocks, dépôts).
          </p>
        </div>
        {others.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun terminal hors-pointage.
          </div>
        ) : (
          <DevicesTable devices={others} sites={sites} mode="other" />
        )}
      </Card>
    </div>
  );
}
