"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, AlertCircle, ArrowDownRight, ArrowUpLeft, HelpCircle, Database, Fingerprint, Sparkles, X, Plus, Users, Download, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  fetchTuyaLogsAction,
  quickEnrollAction,
  listTerminalUsersAction,
  listActiveEmployeesAction,
  runTuyaPollNowAction,
  createEmployeeAndEnrollAction,
  type ResolvedLog,
} from "./actions";

type Device = { tuya_device_id: string; tuya_device_name: string | null };
type Employee = { id: string; full_name: string };
type Site = { id: string; code: string; name: string };

const LOOKBACK_OPTIONS = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3j" },
  { value: 168, label: "7j" },
];

export function LogsViewer({ devices, sites }: { devices: Device[]; sites: Site[] }) {
  const [pending, startTransition] = useTransition();
  const [deviceId, setDeviceId] = useState<string>("all");
  const [lookback, setLookback] = useState<number>(24);
  const [logs, setLogs] = useState<ResolvedLog[]>([]);
  const [unmapped, setUnmapped] = useState<Array<{ device_id: string; device_name: string | null; tuya_user_id: string; count: number }>>([]);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [filterUnmappedOnly, setFilterUnmappedOnly] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [enrolling, setEnrolling] = useState<{
    tuya_device_id: string;
    device_name: string | null;
    tuya_user_id: string;
    suggested_direction?: "in" | "out";
  } | null>(null);
  const [terminalUsers, setTerminalUsers] = useState<Array<{ user_id: string; nick_name: string }>>([]);
  const [showTerminalUsers, setShowTerminalUsers] = useState<string | null>(null);

  function fetchLogs() {
    startTransition(async () => {
      const r = await fetchTuyaLogsAction({
        lookbackHours: lookback,
        deviceId: deviceId as "all" | string,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Échec du fetch");
        return;
      }
      setLogs(r.logs);
      setUnmapped(r.unmappedUserIds);
      setLastFetch(new Date().toLocaleTimeString("fr-BE"));
    });
  }

  useEffect(() => {
    fetchLogs();
    listActiveEmployeesAction().then((r) => setEmployees(r.employees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openTerminalUsers(tuya_device_id: string) {
    setShowTerminalUsers(tuya_device_id);
    const r = await listTerminalUsersAction(tuya_device_id);
    if (r.ok) setTerminalUsers(r.users);
    else toast.error(r.error ?? "Échec");
  }

  const filteredLogs = filterUnmappedOnly ? logs.filter((l) => !l.mapped) : logs;

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-3 flex items-center gap-2 flex-wrap">
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
          >
            <option value="all">Tous les terminaux ({devices.length})</option>
            {devices.map((d) => (
              <option key={d.tuya_device_id} value={d.tuya_device_id}>
                {d.tuya_device_name ?? d.tuya_device_id}
              </option>
            ))}
          </select>
          <div className="flex gap-0.5 border border-line rounded-md overflow-hidden">
            {LOOKBACK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLookback(opt.value)}
                className={`px-2 py-1 text-[12px] ${lookback === opt.value ? "bg-gold-light text-ink-1 font-bold" : "bg-surface text-ink-3 hover:bg-surface-2"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] ml-2">
            <input
              type="checkbox"
              checked={filterUnmappedOnly}
              onChange={(e) => setFilterUnmappedOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Non mappés seulement
          </label>
          <div className="flex-1" />
          {lastFetch && (
            <span className="text-[11px] text-ink-3">Refresh : {lastFetch}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startTransition(async () => {
                const r = await runTuyaPollNowAction({ lookbackDays: 7 });
                if (!r.ok) {
                  toast.error(r.error ?? "Échec du polling");
                } else {
                  toast.success(
                    `Poll OK : ${r.entries_inserted} pointage(s) inséré(s) dans /admin/presence, ${r.skipped_no_mapping} skipped (pas mappé), ${r.skipped_duplicate} doublons.`,
                  );
                  fetchLogs();
                }
              });
            }}
            disabled={pending}
            title="Lance le polling Tuya (7 jours) et insère les events mappés dans clock_entries → visibles dans /admin/presence"
          >
            <Download className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            Backfill 7j → présences
          </Button>
          <Button variant="gold" size="sm" onClick={fetchLogs} disabled={pending}>
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </Card>

      {unmapped.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <div className="p-4">
            <h2 className="font-bold text-sm flex items-center gap-2 text-amber-900">
              <HelpCircle className="h-4 w-4" />
              Empreintes non-mappées ({unmapped.length})
              <span className="text-[10px] font-normal text-amber-700">Clique pour enrôler en 1 clic</span>
            </h2>
            <div className="mt-2 grid sm:grid-cols-2 gap-1.5">
              {unmapped.map((u, i) => (
                <button
                  key={i}
                  onClick={() => setEnrolling({
                    tuya_device_id: u.device_id,
                    device_name: u.device_name,
                    tuya_user_id: u.tuya_user_id,
                  })}
                  className="text-[12px] bg-white border border-amber-300 rounded px-2 py-1 flex items-center justify-between hover:bg-amber-100 transition-colors text-left"
                >
                  <span>
                    <strong>tuya_id={u.tuya_user_id}</strong>
                    <span className="text-ink-3"> · {u.device_name ?? u.device_id.slice(0, 12)}</span>
                  </span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded ml-2 shrink-0">
                    {u.count}× · enrôler
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-3 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">
            Passages ({filteredLogs.length}{filterUnmappedOnly ? ` / ${logs.length}` : ""})
          </h2>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex gap-1">
              {devices.map((d) => (
                <button
                  key={d.tuya_device_id}
                  onClick={() => openTerminalUsers(d.tuya_device_id)}
                  className="text-[10px] px-2 py-0.5 rounded border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1"
                >
                  <Users className="h-3 w-3" />
                  Noms {d.tuya_device_name?.replace("Pointage ", "") ?? "?"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {filteredLogs.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            {pending ? "Chargement…" : "Aucun unlock event sur cette période."}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredLogs.map((log, i) => (
              <LogRow
                key={`${log.device_id}-${log.event_time}-${i}`}
                log={log}
                onEnrollClick={() => log.user_id_in_device != null && setEnrolling({
                  tuya_device_id: log.device_id,
                  device_name: log.device_name,
                  tuya_user_id: String(log.user_id_in_device),
                })}
              />
            ))}
          </div>
        )}
      </Card>

      {enrolling && (
        <EnrollModal
          context={enrolling}
          employees={employees}
          sites={sites}
          onClose={() => setEnrolling(null)}
          onDone={(newEmployee) => {
            if (newEmployee) setEmployees((prev) => [...prev, newEmployee].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setEnrolling(null);
            fetchLogs();
          }}
        />
      )}

      {showTerminalUsers && (
        <TerminalUsersModal
          tuya_device_id={showTerminalUsers}
          device_name={devices.find((d) => d.tuya_device_id === showTerminalUsers)?.tuya_device_name ?? null}
          users={terminalUsers}
          onClose={() => { setShowTerminalUsers(null); setTerminalUsers([]); }}
        />
      )}
    </div>
  );
}

function LogRow({ log, onEnrollClick }: { log: ResolvedLog; onEnrollClick: () => void }) {
  const date = new Date(log.event_time);
  const [time, setTime] = useState("…");
  const [day, setDay] = useState("…");
  useEffect(() => {
    setTime(date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setDay(date.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" }));
  }, [log.event_time]);

  if (log.status === "error") {
    return (
      <div className="p-3 flex items-start gap-3 bg-red-50/40">
        <AlertCircle className="h-4 w-4 text-red-700 mt-0.5 shrink-0" />
        <div className="text-[12px] text-red-900 flex-1">
          <strong>{log.device_name ?? log.device_id}</strong> : {log.method_label}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 flex items-start gap-3 hover:bg-surface-2/50">
      <div className="text-[11px] text-ink-3 w-20 shrink-0 font-mono">
        <div>{day}</div>
        <div className="font-bold text-ink-1">{time}</div>
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold truncate">{log.device_name ?? log.device_id.slice(0, 14)}</span>
          {log.method_label && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-3">
              {log.method_label}
            </span>
          )}
          {log.direction === "in" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 inline-flex items-center gap-0.5">
              <ArrowDownRight className="h-3 w-3" /> IN
            </span>
          )}
          {log.direction === "out" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 inline-flex items-center gap-0.5">
              <ArrowUpLeft className="h-3 w-3" /> OUT
            </span>
          )}
          {log.already_in_clock_entries && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 inline-flex items-center gap-0.5">
              <Database className="h-3 w-3" /> En base
            </span>
          )}
        </div>

        {log.mapped ? (
          <div className="text-[12px] text-ink-1">
            <Fingerprint className="h-3 w-3 inline text-blue-600 mr-1" />
            {log.employee_id ? (
              <Link
                href={`/planning/employees/${log.employee_id}/prestations?view=week`}
                className="font-bold text-blue-700 hover:underline inline-flex items-center gap-0.5"
                title="Voir prestations jour/semaine/mois"
              >
                {log.employee_name ?? "?"}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            ) : (
              <strong>{log.employee_name ?? "?"}</strong>
            )}
            <span className="text-ink-3"> · tuya_user_id={log.user_id_in_device}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEnrollClick}
            className="text-[12px] text-amber-900 hover:text-amber-700 hover:underline text-left"
          >
            <HelpCircle className="h-3 w-3 inline text-amber-600 mr-1" />
            <strong>Non mappé</strong>
            <span className="text-ink-3"> · tuya_user_id=<code>{log.user_id_in_device ?? "?"}</code></span>
            <span className="text-[10px] text-amber-700 ml-2 inline-flex items-center gap-0.5">
              <Sparkles className="h-3 w-3" /> Clique pour enrôler
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function EnrollModal({
  context,
  employees,
  sites,
  onClose,
  onDone,
}: {
  context: { tuya_device_id: string; device_name: string | null; tuya_user_id: string; suggested_direction?: "in" | "out" };
  employees: Employee[];
  sites: Site[];
  onClose: () => void;
  onDone: (newEmployee?: Employee) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">(context.suggested_direction ?? "in");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [newFullName, setNewFullName] = useState("");
  const [newSiteId, setNewSiteId] = useState<string>(sites[0]?.id ?? "");

  const filteredEmps = search.trim()
    ? employees.filter((e) => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : employees;

  // Si la recherche ne matche aucun employe, suggere la creation avec le texte saisi
  const noMatch = search.trim().length >= 2 && filteredEmps.length === 0;
  useEffect(() => {
    if (noMatch && mode === "existing") {
      setNewFullName(search.trim());
    }
  }, [noMatch, search, mode]);

  function submit() {
    if (mode === "existing") {
      if (!employeeId) {
        toast.error("Sélectionne un employé ou crée-en un nouveau");
        return;
      }
      const emp = employees.find((x) => x.id === employeeId);
      const autoName = emp ? `${emp.full_name} ${direction.toUpperCase()}` : "";
      startTransition(async () => {
        const r = await quickEnrollAction({
          tuya_device_id: context.tuya_device_id,
          tuya_user_id: context.tuya_user_id,
          employee_id: employeeId,
          direction,
          tuya_name: name.trim() || autoName,
        });
        if (!r.ok) toast.error(r.error ?? "Échec");
        else {
          const rec = r.recovered ? ` · ${r.recovered} présence(s) récupérée(s) (30 j)` : " · aucune présence à récupérer (30 j)";
          toast.success(`Empreinte ${direction.toUpperCase()} mappée à ${emp?.full_name}${rec}.`);
          onDone();
        }
      });
    } else {
      // Mode creation : creer employe + assignment + mapping
      if (!newFullName.trim()) {
        toast.error("Saisis le nom complet");
        return;
      }
      if (!newSiteId) {
        toast.error("Choisis le site de l'employé");
        return;
      }
      startTransition(async () => {
        const r = await createEmployeeAndEnrollAction({
          full_name: newFullName.trim(),
          site_id: newSiteId,
          tuya_device_id: context.tuya_device_id,
          tuya_user_id: context.tuya_user_id,
          direction,
          tuya_name: name.trim() || `${newFullName.trim()} ${direction.toUpperCase()}`,
        });
        if (!r.ok) toast.error(r.error ?? "Échec création");
        else {
          const siteName = sites.find((s) => s.id === newSiteId)?.code ?? "?";
          const rec = r.recovered ? ` · ${r.recovered} présence(s) récupérée(s) (30 j)` : "";
          toast.success(`${newFullName} créé(e), assigné(e) au site ${siteName}, empreinte ${direction.toUpperCase()} mappée${rec}.`);
          onDone(r.employee_id ? { id: r.employee_id, full_name: newFullName.trim() } : undefined);
        }
      });
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" />
              Enrôler cette empreinte
            </h3>
            <p className="text-[11px] text-ink-3 mt-0.5">
              <strong>{context.device_name ?? context.tuya_device_id}</strong>
              {" · tuya_user_id="}<code className="bg-surface-2 px-1 rounded">{context.tuya_user_id}</code>
            </p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-ink-2 block mb-1">Direction</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setDirection("in")}
                className={`flex-1 text-sm px-2 py-2 rounded-md border ${
                  direction === "in"
                    ? "bg-emerald-100 border-emerald-400 text-emerald-900 font-bold"
                    : "bg-surface border-line text-ink-3"
                }`}
              >
                <ArrowDownRight className="h-4 w-4 inline mr-1" />
                IN (entrée)
              </button>
              <button
                type="button"
                onClick={() => setDirection("out")}
                className={`flex-1 text-sm px-2 py-2 rounded-md border ${
                  direction === "out"
                    ? "bg-amber-100 border-amber-400 text-amber-900 font-bold"
                    : "bg-surface border-line text-ink-3"
                }`}
              >
                <ArrowUpLeft className="h-4 w-4 inline mr-1" />
                OUT (sortie)
              </button>
            </div>
          </div>

          <div className="flex gap-1 border border-line rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex-1 text-[12px] px-2 py-1.5 ${mode === "existing" ? "bg-gold-light text-ink-1 font-bold" : "bg-surface text-ink-3 hover:bg-surface-2"}`}
            >
              Employé existant
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`flex-1 text-[12px] px-2 py-1.5 ${mode === "create" ? "bg-gold-light text-ink-1 font-bold" : "bg-surface text-ink-3 hover:bg-surface-2"}`}
            >
              + Créer un employé
            </button>
          </div>

          {mode === "existing" ? (
            <div>
              <label className="text-[11px] font-bold text-ink-2 block mb-1">Employé</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface mb-1"
                autoFocus
              />
              <div className="max-h-48 overflow-auto border border-line rounded-md">
                {filteredEmps.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setEmployeeId(emp.id)}
                    className={`w-full text-left text-sm px-3 py-1.5 border-b border-line last:border-0 hover:bg-surface-2 ${
                      employeeId === emp.id ? "bg-gold-light/40 font-bold" : ""
                    }`}
                  >
                    {emp.full_name}
                  </button>
                ))}
                {filteredEmps.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className="w-full text-center text-sm py-3 text-emerald-700 hover:bg-emerald-50 font-medium"
                  >
                    + Aucun employé "{search}" — créer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 border border-emerald-300 bg-emerald-50/30 rounded-md p-3">
              <div>
                <label className="text-[11px] font-bold text-ink-2 block mb-1">Nom complet du nouvel employé</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="ex: Mehdi El Bakr"
                  className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-2 block mb-1">Site principal</label>
                <select
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value)}
                  className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-emerald-900">
                Sera créé avec : email placeholder, CDI, 38h/sem, démarrage aujourd'hui. À compléter ensuite via <em>/planning/employees</em>.
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-ink-2 block mb-1">
              Étiquette Tuya <span className="text-ink-3 font-normal">(libellé sauvegardé en BDD, facultatif)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "existing"
                  ? (employeeId ? `Auto : ${employees.find((x) => x.id === employeeId)?.full_name} ${direction.toUpperCase()}` : "Sélectionne d'abord un employé")
                  : (newFullName ? `Auto : ${newFullName} ${direction.toUpperCase()}` : "Saisis d'abord le nom")
              }
              className="w-full text-sm rounded-md border border-line px-2 py-1.5 bg-surface"
            />
          </div>
        </div>

        <div className="p-4 border-t border-line flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="gold"
            size="sm"
            onClick={submit}
            disabled={
              pending ||
              (mode === "existing" && !employeeId) ||
              (mode === "create" && (!newFullName.trim() || !newSiteId))
            }
          >
            {pending
              ? (mode === "create" ? "Création…" : "Enrôlement…")
              : mode === "create"
                ? "Créer + Enrôler"
                : employeeId ? "Enrôler" : "Choisir un employé"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TerminalUsersModal({
  tuya_device_id,
  device_name,
  users,
  onClose,
}: {
  tuya_device_id: string;
  device_name: string | null;
  users: Array<{ user_id: string; nick_name: string }>;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Noms enrôlés sur <strong>{device_name ?? tuya_device_id}</strong>
            </h3>
            <p className="text-[11px] text-ink-3 mt-0.5">
              Récupéré depuis le terminal Tuya. Le tuya_user_id (alphanumérique) ne correspond pas directement au slot du log — utilise-le pour <em>reconnaître</em> qui est enrôlé.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          {users.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Chargement…</div>
          ) : (
            <div className="divide-y divide-line">
              {users.map((u) => (
                <div key={u.user_id} className="px-3 py-1.5 text-sm flex items-center justify-between">
                  <span className="font-medium">{u.nick_name}</span>
                  <code className="text-[10px] text-ink-3">{u.user_id}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
