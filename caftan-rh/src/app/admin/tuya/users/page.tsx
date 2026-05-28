import Link from "next/link";
import { ArrowLeft, Users, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UsersMappingForm } from "./users-form";

type DeviceRow = { tuya_device_id: string; tuya_device_name: string | null; site_id: string | null };
type EmployeeRow = { id: string; full_name: string; status: string };
type MappingRow = {
  id: string;
  tuya_device_id: string | null;
  tuya_user_id: string;
  employee_id: string;
  direction: "in" | "out";
  tuya_name: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function AdminTuyaUsersPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: devicesRaw }, { data: employeesRaw }, { data: mappingsRaw }] = await Promise.all([
    supabase
      .from("tuya_devices")
      .select("tuya_device_id, tuya_device_name, site_id")
      .eq("is_pointage", true)
      .eq("is_active", true)
      .order("tuya_device_name"),
    supabase
      .from("employees")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("tuya_user_mapping")
      .select("id, tuya_device_id, tuya_user_id, employee_id, direction, tuya_name, is_active, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const devices = (devicesRaw ?? []) as DeviceRow[];
  const employees = (employeesRaw ?? []) as EmployeeRow[];
  const mappings = (mappingsRaw ?? []) as MappingRow[];

  // Detection des employes qui n ont pas un couple IN+OUT complet par terminal.
  const completeness = new Map<string, { in: boolean; out: boolean }>();
  for (const m of mappings) {
    if (!m.is_active) continue;
    const key = `${m.employee_id}|${m.tuya_device_id ?? "?"}`;
    const cur = completeness.get(key) ?? { in: false, out: false };
    cur[m.direction] = true;
    completeness.set(key, cur);
  }
  const incomplete: Array<{ employee: EmployeeRow; device: DeviceRow; missing: "in" | "out" | "both" }> = [];
  for (const emp of employees) {
    for (const dev of devices) {
      const c = completeness.get(`${emp.id}|${dev.tuya_device_id}`) ?? { in: false, out: false };
      const hasIn = c.in;
      const hasOut = c.out;
      if (hasIn && hasOut) continue;
      if (hasIn || hasOut) {
        incomplete.push({
          employee: emp,
          device: dev,
          missing: hasIn ? "out" : "in",
        });
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-gold-dark" />
            Enrôlement empreintes Tuya
          </h1>
          <p className="text-sm text-ink-2">
            Chaque employé doit avoir 2 empreintes par terminal : "Nom IN" et "Nom OUT". Le tuya_user_id est le numéro d'enrôlement local affiché par le terminal lors de l'ajout d'empreinte.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/logs">Logs</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/devices">Terminaux</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour admin
            </Link>
          </Button>
        </div>
      </div>

      {devices.length === 0 && (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun terminal pointage actif. Configure d'abord <Link className="underline text-gold-dark" href="/admin/tuya/devices">les terminaux</Link>.
          </div>
        </Card>
      )}

      {incomplete.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <div className="p-4">
            <h2 className="font-bold text-sm flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Enrôlements partiels ({incomplete.length})
            </h2>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Employés avec une seule direction enrôlée. Sans le couple IN+OUT complet, le pointage automatique ne fonctionnera pas pour eux.
            </p>
            <ul className="mt-2 text-[12px] space-y-1">
              {incomplete.slice(0, 10).map((x, i) => (
                <li key={i} className="text-amber-900">
                  <strong>{x.employee.full_name}</strong> sur <em>{x.device.tuya_device_name ?? x.device.tuya_device_id}</em> : manque <code>{x.missing.toUpperCase()}</code>
                </li>
              ))}
              {incomplete.length > 10 && (
                <li className="text-amber-700 italic">…et {incomplete.length - 10} autres.</li>
              )}
            </ul>
          </div>
        </Card>
      )}

      <UsersMappingForm
        devices={devices}
        employees={employees}
        mappings={mappings}
      />
    </div>
  );
}
