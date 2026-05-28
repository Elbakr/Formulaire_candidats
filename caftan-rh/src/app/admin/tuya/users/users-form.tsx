"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ArrowDownRight, ArrowUpLeft, Pencil, X, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  addMappingAction,
  deleteMappingAction,
  updateMappingAction,
} from "./actions";

type Device = { tuya_device_id: string; tuya_device_name: string | null; site_id: string | null };
type Employee = { id: string; full_name: string; status: string };
type Mapping = {
  id: string;
  tuya_device_id: string | null;
  tuya_user_id: string;
  employee_id: string;
  direction: "in" | "out";
  tuya_name: string | null;
  is_active: boolean;
  created_at: string;
};

export function UsersMappingForm({
  devices,
  employees,
  mappings,
}: {
  devices: Device[];
  employees: Employee[];
  mappings: Mapping[];
}) {
  const [pending, startTransition] = useTransition();
  const [deviceId, setDeviceId] = useState(devices[0]?.tuya_device_id ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [tuyaUserId, setTuyaUserId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [userName, setUserName] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceId || !employeeId || !tuyaUserId.trim()) {
      toast.error("Tous les champs sont requis.");
      return;
    }
    const emp = employees.find((x) => x.id === employeeId);
    const autoName = emp ? `${emp.full_name} ${direction.toUpperCase()}` : "";
    startTransition(async () => {
      const r = await addMappingAction({
        tuya_device_id: deviceId,
        tuya_user_id: tuyaUserId.trim(),
        employee_id: employeeId,
        direction,
        tuya_name: userName.trim() || autoName,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Échec de l'ajout");
      } else {
        toast.success("Empreinte enrôlée.");
        setTuyaUserId("");
        setUserName("");
      }
    });
  }

  const byEmployee = new Map<string, Mapping[]>();
  for (const m of mappings) {
    const arr = byEmployee.get(m.employee_id) ?? [];
    arr.push(m);
    byEmployee.set(m.employee_id, arr);
  }
  const empById = new Map(employees.map((e) => [e.id, e]));
  const devById = new Map(devices.map((d) => [d.tuya_device_id, d]));

  const sortedEmployees = [...byEmployee.keys()]
    .map((id) => empById.get(id))
    .filter((x): x is Employee => Boolean(x))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" />
            Ajouter une empreinte
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Lors de l'enrôlement sur le terminal Tuya, note le numéro affiché à l'écran (= tuya_user_id) et le nom utilisé (ex "Karim IN"). Saisis-les ici.
          </p>
        </div>
        <form onSubmit={handleAdd} className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">Terminal</label>
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
              >
                {devices.map((d) => (
                  <option key={d.tuya_device_id} value={d.tuya_device_id}>
                    {d.tuya_device_name ?? d.tuya_device_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">Employé</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
              >
                <option value="">— Sélectionner —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">tuya_user_id</label>
              <Input
                value={tuyaUserId}
                onChange={(e) => setTuyaUserId(e.target.value)}
                placeholder="ex: 71"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">Direction</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setDirection("in")}
                  className={`flex-1 text-sm px-2 py-1.5 rounded-md border ${
                    direction === "in"
                      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                      : "bg-surface border-line text-ink-3"
                  }`}
                >
                  <ArrowDownRight className="h-3.5 w-3.5 inline mr-1" />
                  IN
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("out")}
                  className={`flex-1 text-sm px-2 py-1.5 rounded-md border ${
                    direction === "out"
                      ? "bg-amber-100 border-amber-300 text-amber-900"
                      : "bg-surface border-line text-ink-3"
                  }`}
                >
                  <ArrowUpLeft className="h-3.5 w-3.5 inline mr-1" />
                  OUT
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">
                Nom sur terminal
                <span className="text-ink-3 font-normal"> (auto: {employeeId ? `${empById.get(employeeId)?.full_name} ${direction.toUpperCase()}` : "—"})</span>
              </label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="laisse vide pour auto"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="gold" size="sm" disabled={pending}>
              <Plus className="h-3.5 w-3.5" />
              {pending ? "Ajout…" : "Ajouter l'empreinte"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">
            Empreintes enrôlées ({mappings.length})
          </h2>
        </div>
        {mappings.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucune empreinte enrôlée. Utilise le formulaire ci-dessus pour commencer.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {sortedEmployees.map((emp) => {
              const empMappings = byEmployee.get(emp.id) ?? [];
              return (
                <div key={emp.id} className="p-3">
                  <h3 className="font-bold text-sm mb-2">{emp.full_name}</h3>
                  <div className="space-y-1.5">
                    {empMappings.map((m) => (
                      <MappingRow
                        key={m.id}
                        mapping={m}
                        device={m.tuya_device_id ? devById.get(m.tuya_device_id) : undefined}
                        devices={devices}
                        employees={employees}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function MappingRow({
  mapping,
  device,
  devices,
  employees,
}: {
  mapping: Mapping;
  device: Device | undefined;
  devices: Device[];
  employees: Employee[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  // State pour l edition
  const [eEmployeeId, setEEmployeeId] = useState(mapping.employee_id);
  const [eDirection, setEDirection] = useState<"in" | "out">(mapping.direction);
  const [eDeviceId, setEDeviceId] = useState<string>(mapping.tuya_device_id ?? "");
  const [eTuyaUserId, setETuyaUserId] = useState(mapping.tuya_user_id);
  const [eTuyaName, setETuyaName] = useState(mapping.tuya_name ?? "");
  const [eSearch, setESearch] = useState("");

  function handleDelete() {
    if (!confirm(`Supprimer définitivement ce mapping ${mapping.direction.toUpperCase()} sur ${device?.tuya_device_name ?? "?"} ?`)) return;
    startTransition(async () => {
      const r = await deleteMappingAction(mapping.id);
      if (!r.ok) toast.error(r.error ?? "Suppression impossible");
      else toast.success("Mapping supprimé.");
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const r = await updateMappingAction({ id: mapping.id, is_active: !mapping.is_active });
      if (!r.ok) toast.error(r.error ?? "Échec");
      else toast.success(mapping.is_active ? "Désactivé" : "Réactivé");
    });
  }

  function startEdit() {
    setEEmployeeId(mapping.employee_id);
    setEDirection(mapping.direction);
    setEDeviceId(mapping.tuya_device_id ?? "");
    setETuyaUserId(mapping.tuya_user_id);
    setETuyaName(mapping.tuya_name ?? "");
    setESearch("");
    setEditing(true);
  }

  function saveEdit() {
    if (!eEmployeeId) { toast.error("Choisis un employé"); return; }
    if (!eTuyaUserId.trim()) { toast.error("tuya_user_id requis"); return; }
    if (!eDeviceId) { toast.error("Choisis un terminal"); return; }
    startTransition(async () => {
      const r = await updateMappingAction({
        id: mapping.id,
        employee_id: eEmployeeId,
        direction: eDirection,
        tuya_device_id: eDeviceId,
        tuya_user_id: eTuyaUserId.trim(),
        tuya_name: eTuyaName.trim() || null,
      });
      if (!r.ok) toast.error(r.error ?? "Échec");
      else {
        toast.success("Mapping mis à jour.");
        setEditing(false);
      }
    });
  }

  const dirColor = mapping.direction === "in"
    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
    : "bg-amber-100 text-amber-900 border-amber-300";

  if (editing) {
    const filteredEmps = eSearch.trim()
      ? employees.filter((e) => e.full_name.toLowerCase().includes(eSearch.toLowerCase()))
      : employees;
    return (
      <div className="rounded-md border border-blue-300 bg-blue-50/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-blue-900">Édition du mapping</span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-ink-3 hover:text-ink-1 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-ink-2 block">Terminal</label>
            <select
              value={eDeviceId}
              onChange={(e) => setEDeviceId(e.target.value)}
              className="w-full text-[12px] rounded-md border border-line px-1.5 py-1 bg-surface"
            >
              {devices.map((d) => (
                <option key={d.tuya_device_id} value={d.tuya_device_id}>{d.tuya_device_name ?? d.tuya_device_id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-ink-2 block">tuya_user_id</label>
            <input
              type="text"
              value={eTuyaUserId}
              onChange={(e) => setETuyaUserId(e.target.value)}
              className="w-full text-[12px] rounded-md border border-line px-1.5 py-1 bg-surface"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-ink-2 block">Direction</label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEDirection("in")}
              className={`flex-1 text-[12px] px-2 py-1 rounded-md border ${eDirection === "in" ? "bg-emerald-100 border-emerald-400 text-emerald-900 font-bold" : "bg-surface border-line text-ink-3"}`}
            >
              <ArrowDownRight className="h-3 w-3 inline mr-1" /> IN
            </button>
            <button
              type="button"
              onClick={() => setEDirection("out")}
              className={`flex-1 text-[12px] px-2 py-1 rounded-md border ${eDirection === "out" ? "bg-amber-100 border-amber-400 text-amber-900 font-bold" : "bg-surface border-line text-ink-3"}`}
            >
              <ArrowUpLeft className="h-3 w-3 inline mr-1" /> OUT
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-ink-2 block">Employé</label>
          <input
            type="text"
            value={eSearch}
            onChange={(e) => setESearch(e.target.value)}
            placeholder="Rechercher pour changer…"
            className="w-full text-[12px] rounded-md border border-line px-1.5 py-1 bg-surface mb-1"
          />
          <div className="max-h-32 overflow-auto border border-line rounded-md">
            {filteredEmps.slice(0, 50).map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => setEEmployeeId(emp.id)}
                className={`w-full text-left text-[12px] px-2 py-1 border-b border-line last:border-0 hover:bg-surface-2 ${eEmployeeId === emp.id ? "bg-blue-100 font-bold" : ""}`}
              >
                {emp.full_name}
              </button>
            ))}
            {filteredEmps.length === 0 && (
              <div className="text-center text-[11px] text-ink-3 py-2">Aucun match</div>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-ink-2 block">Étiquette Tuya (facultatif)</label>
          <input
            type="text"
            value={eTuyaName}
            onChange={(e) => setETuyaName(e.target.value)}
            className="w-full text-[12px] rounded-md border border-line px-1.5 py-1 bg-surface"
          />
        </div>
        <div className="flex justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={saveEdit}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded border border-gold bg-gold text-[#1a1a0d] hover:bg-gold-dark hover:text-white font-bold inline-flex items-center gap-1"
          >
            <Save className="h-3 w-3" />
            {pending ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 p-2 rounded-md border ${mapping.is_active ? "border-line bg-surface" : "border-dashed border-line bg-surface-2/50 opacity-60"}`}>
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${dirColor}`}>
          {mapping.direction === "in" ? <><ArrowDownRight className="h-3 w-3 inline" /> IN</> : <><ArrowUpLeft className="h-3 w-3 inline" /> OUT</>}
        </span>
        <span className="text-[12px] text-ink-2 truncate">
          <strong>{device?.tuya_device_name ?? mapping.tuya_device_id?.slice(0, 12) ?? "?"}</strong>
          {" · "}
          <span className="text-ink-3">tuya_id=</span><code>{mapping.tuya_user_id}</code>
          {mapping.tuya_name && (<>
            {" · "}
            <span className="text-ink-3">nom=</span><em>{mapping.tuya_name}</em>
          </>)}
        </span>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={startEdit}
          disabled={pending}
          className="text-[10px] px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 inline-flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" /> Corriger
        </button>
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={pending}
          className="text-[10px] px-2 py-0.5 rounded border border-line bg-surface hover:bg-surface-2 disabled:opacity-50"
        >
          {mapping.is_active ? "Désactiver" : "Réactiver"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="text-[10px] px-2 py-0.5 rounded border border-danger-light text-danger hover:bg-danger-light disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3 inline" />
        </button>
      </div>
    </div>
  );
}
