import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogsViewer } from "./logs-viewer";

export default async function AdminTuyaLogsPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  // Karim 2026-05-25 : filtre par ville. Devices avec site_id appartenant a
  // la ville selectionnee + devices sans site_id (visibles partout - utile
  // pour le device Pointage A qui peut servir plusieurs sites).
  const { readCity, siteCodesForCity } = await import("@/lib/city");
  const city = await readCity();
  const cityCodes = siteCodesForCity(city);
  const [{ data: devicesRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("tuya_devices")
      .select("tuya_device_id, tuya_device_name, site_id")
      .eq("is_active", true)
      .eq("is_pointage", true)
      .order("tuya_device_name"),
    supabase
      .from("sites")
      .select("id, code, name")
      .eq("is_active", true)
      .in("code", cityCodes as unknown as string[])
      .order("code"),
  ]);
  const sites = (sitesRaw ?? []) as { id: string; code: string; name: string }[];
  const citySiteIds = new Set(sites.map((s) => s.id));
  const allDevices = (devicesRaw ?? []) as { tuya_device_id: string; tuya_device_name: string | null; site_id: string | null }[];
  const devices = allDevices.filter((d) => !d.site_id || citySiteIds.has(d.site_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-gold-dark" />
            Logs Tuya — passages aux terminaux
          </h1>
          <p className="text-sm text-ink-2">
            Unlock events bruts récupérés en direct depuis l'API Tuya. Utile pour identifier les <code>tuya_user_id</code> lors de l'enrôlement et débugger les pointages.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/devices">Terminaux</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/users">Empreintes</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </Link>
          </Button>
        </div>
      </div>

      {devices.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun terminal pointage actif.
          </div>
        </Card>
      ) : (
        <LogsViewer devices={devices} sites={sites} />
      )}
    </div>
  );
}
