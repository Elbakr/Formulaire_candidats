"use client";

import { useState, useEffect, useTransition } from "react";
import { CheckCircle2, XCircle, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  updateTuyaDeviceAction,
  syncFromTuyaAction,
  type UpdateDevicePayload,
} from "./actions";

type Site = { id: string; code: string; name: string };
type Device = {
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

export function DevicesTable({
  devices,
  sites,
  mode,
}: {
  devices: Device[];
  sites: Site[];
  mode: "pointage" | "other";
}) {
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const r = await syncFromTuyaAction();
      if (!r.ok) {
        toast.error(r.error ?? "Sync impossible");
      } else if (r.failed > 0) {
        toast.warning(`Sync : ${r.synced} OK, ${r.failed} en erreur.`, {
          description: r.errors.slice(0, 2).join(" | "),
        });
      } else {
        toast.success(`Sync OK : ${r.synced} terminaux rafraîchis depuis Tuya.`);
      }
    });
  }

  return (
    <div>
      <div className="p-3 border-b border-line flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={pending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          Rafraîchir depuis Tuya
        </Button>
      </div>
      <div className="divide-y divide-line">
        {devices.map((d) => (
          <DeviceRow key={d.tuya_device_id} device={d} sites={sites} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function DeviceRow({ device, sites, mode }: { device: Device; sites: Site[]; mode: "pointage" | "other" }) {
  const [pending, startTransition] = useTransition();
  const [siteId, setSiteId] = useState<string>(device.site_id ?? "");
  const [fallback, setFallback] = useState<string[]>(device.fallback_for_site_ids ?? []);
  const [active, setActive] = useState<boolean>(device.is_active);
  const [isPointage, setIsPointage] = useState<boolean>(device.is_pointage);
  const [notes, setNotes] = useState<string>(device.notes ?? "");

  const dirty =
    siteId !== (device.site_id ?? "") ||
    JSON.stringify([...fallback].sort()) !== JSON.stringify([...(device.fallback_for_site_ids ?? [])].sort()) ||
    active !== device.is_active ||
    isPointage !== device.is_pointage ||
    notes !== (device.notes ?? "");

  function save() {
    const payload: UpdateDevicePayload = {
      tuya_device_id: device.tuya_device_id,
      site_id: siteId || null,
      fallback_for_site_ids: fallback,
      is_active: active,
      is_pointage: isPointage,
      notes: notes || null,
    };
    startTransition(async () => {
      const r = await updateTuyaDeviceAction(payload);
      if (!r.ok) toast.error(r.error ?? "Échec de la sauvegarde");
      else toast.success(`${device.tuya_device_name ?? device.tuya_device_id} mis à jour.`);
    });
  }

  function toggleFallback(id: string) {
    setFallback((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // Evite hydration mismatch : formate la date cote client uniquement.
  const [lastSeen, setLastSeen] = useState<string>("…");
  useEffect(() => {
    setLastSeen(
      device.last_seen_at
        ? new Date(device.last_seen_at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })
        : "—",
    );
  }, [device.last_seen_at]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm truncate">{device.tuya_device_name ?? device.tuya_device_id}</h3>
            {device.online === true && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Online
              </span>
            )}
            {device.online === false && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 inline-flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Offline
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-3">
              {device.category ?? "?"}
            </span>
          </div>
          <code className="text-[10px] text-ink-3 break-all">{device.tuya_device_id}</code>
          <div className="text-[11px] text-ink-3 mt-0.5">Dernier sync : {lastSeen}</div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Actif
          </label>
          <label className="flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={isPointage}
              onChange={(e) => setIsPointage(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Pointage
          </label>
        </div>
      </div>

      {mode === "pointage" && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-ink-2 block mb-1">Site principal</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
            >
              <option value="">— Non assigné —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-2 block mb-1">
              Sites fallback (employés des sites cochés pointent ici)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sites.filter((s) => s.id !== siteId).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleFallback(s.id)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    fallback.includes(s.id)
                      ? "bg-gold-light/30 border-gold text-ink-1"
                      : "bg-surface border-line text-ink-3 hover:bg-surface-2"
                  }`}
                >
                  {s.code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold text-ink-2 block mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full text-[12px] rounded-md border border-line px-2 py-1.5 bg-surface"
          placeholder="Notes internes (rôle du terminal, particularités, etc.)"
        />
      </div>

      <div className="flex justify-end">
        <Button
          variant="gold"
          size="sm"
          onClick={save}
          disabled={!dirty || pending}
        >
          <Save className="h-3.5 w-3.5" />
          {pending ? "Enregistrement…" : dirty ? "Enregistrer" : "À jour"}
        </Button>
      </div>
    </div>
  );
}
