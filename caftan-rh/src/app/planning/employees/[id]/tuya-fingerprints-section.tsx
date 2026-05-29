"use client";

// Karim 2026-05-29 : section "Empreintes Tuya" sur la fiche employee.
// Affiche TOUS les slots actifs de l employee (tous terminaux), permet
// d en ajouter (pour les reenrolements) ou retirer.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Plus, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listEmployeeFingerprintsAction,
  addFingerprintMappingAction,
  deactivateFingerprintMappingAction,
  type FingerprintMapping,
} from "./tuya-fingerprints-actions";

type Device = { tuya_device_id: string; tuya_device_name: string };

export function TuyaFingerprintsSection({
  employeeId,
  employeeName,
  devices,
}: {
  employeeId: string;
  employeeName: string;
  devices: Device[];
}) {
  const router = useRouter();
  const [mappings, setMappings] = useState<FingerprintMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState<string>(devices[0]?.tuya_device_id ?? "");
  const [newSlot, setNewSlot] = useState<string>("");

  useEffect(() => {
    loadMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function loadMappings() {
    setLoading(true);
    const res = await listEmployeeFingerprintsAction(employeeId);
    if (res.error) toast.error(res.error);
    else setMappings(res.data ?? []);
    setLoading(false);
  }

  function handleAdd() {
    if (!newDeviceId || !newSlot || !/^\d+$/.test(newSlot)) {
      toast.error("Choisis un terminal et entre un numéro de slot (entier).");
      return;
    }
    startTransition(async () => {
      const res = await addFingerprintMappingAction({
        employeeId,
        tuyaDeviceId: newDeviceId,
        tuyaUserId: newSlot,
        tuyaName: `${employeeName} - slot ${newSlot}`,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Slot ${newSlot} associé à ${employeeName}.`);
      setAddOpen(false);
      setNewSlot("");
      await loadMappings();
      router.refresh();
    });
  }

  function handleRemove(mapping: FingerprintMapping) {
    if (!confirm(`Désactiver le slot ${mapping.tuya_user_id ?? "?"} (${mapping.tuya_device_name ?? "?"}) pour ${employeeName} ?`)) return;
    startTransition(async () => {
      const res = await deactivateFingerprintMappingAction(mapping.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Empreinte désactivée.");
      await loadMappings();
      router.refresh();
    });
  }

  const activeMappings = mappings.filter((m) => m.is_active);
  // Groupe par device
  const byDevice = new Map<string, FingerprintMapping[]>();
  for (const m of activeMappings) {
    const arr = byDevice.get(m.tuya_device_id) ?? [];
    arr.push(m);
    byDevice.set(m.tuya_device_id, arr);
  }

  return (
    <Card>
      <div className="px-3 py-2 border-b border-line flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-info" />
        <h2 className="font-bold text-sm">Empreintes Tuya</h2>
        <span className="text-[10px] text-ink-3 ml-auto">
          {loading ? "Chargement…" : `${activeMappings.length} slot(s) actif(s) sur ${byDevice.size} terminal(aux)`}
        </span>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} disabled={pending}>
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>
      <div className="p-3 space-y-2">
        {loading ? (
          <div className="text-xs text-ink-3 italic">Chargement…</div>
        ) : activeMappings.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 mt-0.5" />
            <div className="text-amber-900">
              <strong>Aucune empreinte associée.</strong><br />
              Cet employé ne pourra pas pointer tant qu&apos;une empreinte n&apos;est pas mappée.
              Clique &quot;Ajouter&quot; et entre le slot Tuya (visible dans /admin/tuya/logs).
            </div>
          </div>
        ) : (
          [...byDevice.entries()].map(([deviceId, mps]) => (
            <div key={deviceId} className="border border-line rounded">
              <div className="px-2 py-1.5 bg-surface-2/40 border-b border-line text-[11px] font-bold text-ink-2">
                {mps[0].tuya_device_name ?? deviceId.slice(0, 12)}
                <span className="text-[10px] font-normal text-ink-3 ml-2">
                  ({mps.length} empreinte{mps.length > 1 ? "s" : ""})
                </span>
              </div>
              <ul className="divide-y divide-line">
                {mps.map((m) => (
                  <li key={m.id} className="px-2 py-1.5 flex items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-bold">
                      slot {m.tuya_user_id ?? "?"}
                    </span>
                    {m.tuya_user_id_alpha ? (
                      <span className="text-[10px] text-ink-3 font-mono">alpha={m.tuya_user_id_alpha}</span>
                    ) : null}
                    <span className="text-ink-2 truncate flex-1">{m.tuya_name ?? "(sans label)"}</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      disabled={pending}
                      className="text-rose-600 hover:bg-rose-50 rounded p-1"
                      title="Désactiver ce slot"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <div className="text-[10px] text-ink-3 italic mt-2">
          ℹ Un employé peut avoir plusieurs empreintes sur le même terminal (1 doigt pour IN, 1 autre pour OUT)
          ou pointer sur plusieurs terminaux. Tous les pointages sont agrégés sous son compte unique.
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!pending) setAddOpen(o); }}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Ajouter une empreinte Tuya</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Terminal</label>
              <select
                value={newDeviceId}
                onChange={(e) => setNewDeviceId(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-line bg-surface text-sm"
              >
                {devices.map((d) => (
                  <option key={d.tuya_device_id} value={d.tuya_device_id}>
                    {d.tuya_device_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">
                Slot (numéro entier, visible dans /admin/tuya/logs)
              </label>
              <input
                type="number"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                placeholder="ex: 49"
                min="1"
                className="w-full px-2 py-1.5 rounded border border-line bg-surface text-sm font-mono"
                autoFocus
              />
              <p className="text-[10px] text-ink-3 italic mt-1">
                Va sur <code className="bg-surface-2 px-1 rounded">/admin/tuya/logs</code>, repère le slot
                non mappé de cet employé, copie son numéro ici.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" size="sm" onClick={handleAdd} disabled={pending || !newSlot}>
              {pending ? "Ajout…" : "Ajouter l'empreinte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
