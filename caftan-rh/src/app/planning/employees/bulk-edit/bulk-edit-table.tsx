"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateEmployeeBulkAction } from "./actions";

export type SiteOption = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

export type EmpRow = {
  id: string;
  full_name: string;
  status: "active" | "on_leave" | "archived";
  contract_type: string | null;
  weekly_hours: number | null;
  default_pause_minutes: number | null;
  ot_eligible: boolean | null;
  ot_max_multiplier: number | null;
  is_manager: boolean | null;
  is_site_manager: boolean | null;
  fixed_off_days: number[] | null;
  preferred_site_ids: string[] | null;
  unavailable_site_ids: string[] | null;
  job_title: string | null;
};

const DOW_LABELS = ["D", "L", "M", "M", "J", "V", "S"]; // 0=Dim..6=Sam

const CONTRACT_OPTIONS = [
  { value: "", label: "—" },
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "Étudiant", label: "Étudiant" },
  { value: "Intérim", label: "Intérim" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Actif" },
  { value: "on_leave", label: "En congé" },
  { value: "archived", label: "Archivé" },
];

type Edits = {
  weekly_hours?: number | null;
  contract_type?: string | null;
  default_pause_minutes?: number | null;
  ot_eligible?: boolean;
  ot_max_multiplier?: number;
  is_manager?: boolean;
  is_site_manager?: boolean;
  fixed_off_days?: number[];
  preferred_site_ids?: string[];
  unavailable_site_ids?: string[];
  status?: EmpRow["status"];
};

export function BulkEditTable({
  employees,
  sites,
}: {
  employees: EmpRow[];
  sites: SiteOption[];
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Map<string, Edits>>(new Map());
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  function setField<K extends keyof Edits>(empId: string, key: K, value: Edits[K]) {
    setEdits((prev) => {
      const m = new Map(prev);
      const cur = m.get(empId) ?? {};
      m.set(empId, { ...cur, [key]: value });
      return m;
    });
  }

  function getValue<K extends keyof Edits>(
    emp: EmpRow,
    key: K,
  ): Edits[K] | undefined {
    const e = edits.get(emp.id);
    if (e && key in e) return e[key];
    // Fallback to current value
    switch (key) {
      case "weekly_hours": return emp.weekly_hours as Edits[K];
      case "contract_type": return (emp.contract_type ?? "") as Edits[K];
      case "default_pause_minutes": return emp.default_pause_minutes as Edits[K];
      case "ot_eligible": return (emp.ot_eligible ?? false) as Edits[K];
      case "ot_max_multiplier": return (emp.ot_max_multiplier ?? 1.0) as Edits[K];
      case "is_manager": return (emp.is_manager ?? false) as Edits[K];
      case "is_site_manager": return (emp.is_site_manager ?? false) as Edits[K];
      case "fixed_off_days": return (emp.fixed_off_days ?? []) as Edits[K];
      case "preferred_site_ids": return (emp.preferred_site_ids ?? []) as Edits[K];
      case "unavailable_site_ids": return (emp.unavailable_site_ids ?? []) as Edits[K];
      case "status": return emp.status as Edits[K];
    }
    return undefined;
  }

  function isDirty(empId: string): boolean {
    const e = edits.get(empId);
    return !!e && Object.keys(e).length > 0;
  }

  function reset(empId: string) {
    setEdits((prev) => {
      const m = new Map(prev);
      m.delete(empId);
      return m;
    });
  }

  function save(emp: EmpRow) {
    const patch = edits.get(emp.id);
    if (!patch || Object.keys(patch).length === 0) return;
    setSavingId(emp.id);
    startTransition(async () => {
      const r = await updateEmployeeBulkAction(emp.id, patch);
      setSavingId(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${emp.full_name} mis à jour.`);
      reset(emp.id);
      router.refresh();
    });
  }

  function toggleDow(emp: EmpRow, dow: number) {
    const cur = getValue(emp, "fixed_off_days") ?? [];
    const next = cur.includes(dow) ? cur.filter((d) => d !== dow) : [...cur, dow];
    setField(emp.id, "fixed_off_days", next.sort());
  }

  function toggleSite(
    emp: EmpRow,
    siteId: string,
    kind: "preferred" | "unavailable",
  ) {
    const key = kind === "preferred" ? "preferred_site_ids" : "unavailable_site_ids";
    const cur = getValue(emp, key) ?? [];
    const next = cur.includes(siteId)
      ? cur.filter((s) => s !== siteId)
      : [...cur, siteId];
    setField(emp.id, key, next);
    // Si on ajoute en preferred, on retire de unavailable (et inverse).
    if (!cur.includes(siteId)) {
      const otherKey = kind === "preferred" ? "unavailable_site_ids" : "preferred_site_ids";
      const otherCur = getValue(emp, otherKey) ?? [];
      if (otherCur.includes(siteId)) {
        setField(emp.id, otherKey, otherCur.filter((s) => s !== siteId));
      }
    }
  }

  const dirtyCount = [...edits.values()].filter((e) => Object.keys(e).length > 0).length;

  return (
    <div>
      {dirtyCount > 0 ? (
        <div className="px-3 py-2 border-b border-line bg-gold-light/30 text-xs flex items-center gap-2">
          <span className="font-bold text-gold-dark">
            {dirtyCount} ligne{dirtyCount > 1 ? "s" : ""} modifiée{dirtyCount > 1 ? "s" : ""}
          </span>
          <span className="text-ink-3">— sauve par ligne ou tout réinitialiser :</span>
          <button
            onClick={() => setEdits(new Map())}
            className="ml-auto text-[11px] text-ink-3 hover:text-danger underline"
          >
            Tout annuler
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 min-w-[180px]">Employé</th>
              <th className="text-right px-2 py-2">Wk h</th>
              <th className="text-center px-2 py-2">Contrat</th>
              <th className="text-right px-2 py-2">Pause</th>
              <th className="text-center px-2 py-2 min-w-[180px]" title="Coefficient OT max (1.0 = pas d OT, 2.5 = responsable magasin).">
                Niveau OT (×)
              </th>
              <th className="text-center px-2 py-2 min-w-[100px]" title="Manager (priorise + cap min x2.0) / Resp. Magasin (priorise + cap min x2.5)">
                Rôle
              </th>
              <th className="text-center px-3 py-2 min-w-[140px]">Jours OFF fixes</th>
              <th className="text-center px-3 py-2 min-w-[200px]">Sites préférés</th>
              <th className="text-center px-3 py-2 min-w-[200px]">Sites bloqués</th>
              <th className="text-center px-2 py-2">Statut</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const dirty = isDirty(emp.id);
              const wkH = getValue(emp, "weekly_hours");
              const ct = getValue(emp, "contract_type");
              const pause = getValue(emp, "default_pause_minutes");
              const otMult = getValue(emp, "ot_max_multiplier") ?? 1.0;
              const isMgr = getValue(emp, "is_manager") ?? false;
              const isSiteMgr = getValue(emp, "is_site_manager") ?? false;
              const offDays = getValue(emp, "fixed_off_days") ?? [];
              const prefSites = getValue(emp, "preferred_site_ids") ?? [];
              const blockSites = getValue(emp, "unavailable_site_ids") ?? [];
              const status = getValue(emp, "status") ?? "active";
              const isSaving = savingId === emp.id && pending;
              return (
                <tr
                  key={emp.id}
                  className={`border-t border-line transition-colors ${
                    dirty ? "bg-gold-light/20" : "hover:bg-surface-2"
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-bold">{emp.full_name}</div>
                    <div className="text-[10px] text-ink-3">{emp.job_title ?? "—"}</div>
                  </td>
                  <td className="text-right px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="60"
                      value={wkH ?? ""}
                      onChange={(e) => setField(emp.id, "weekly_hours", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-14 h-7 px-1 text-right border border-line rounded text-xs font-mono"
                      aria-label={`Heures/semaine ${emp.full_name}`}
                    />
                  </td>
                  <td className="text-center px-2 py-2">
                    <select
                      value={ct ?? ""}
                      onChange={(e) => setField(emp.id, "contract_type", e.target.value || null)}
                      className="h-7 px-1 border border-line rounded text-xs"
                      aria-label={`Type de contrat ${emp.full_name}`}
                    >
                      {CONTRACT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right px-2 py-2">
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="120"
                      value={pause ?? ""}
                      onChange={(e) => setField(emp.id, "default_pause_minutes", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-14 h-7 px-1 text-right border border-line rounded text-xs font-mono"
                      aria-label={`Pause minutes ${emp.full_name}`}
                    />
                  </td>
                  <td className="text-center px-2 py-2">
                    <OTLevelSlider
                      value={otMult}
                      weeklyHours={(wkH ?? 38)}
                      onChange={(v) => setField(emp.id, "ot_max_multiplier", v)}
                      aria-label={`Niveau OT ${emp.full_name}`}
                    />
                  </td>
                  <td className="text-center px-2 py-2">
                    <div className="flex flex-col gap-1 items-stretch">
                      <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isMgr}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setField(emp.id, "is_manager", v);
                            // Si on coche manager et que OT mult < 2.0, on le push.
                            if (v && (otMult ?? 1.0) < 2.0) setField(emp.id, "ot_max_multiplier", 2.0);
                          }}
                          className="cursor-pointer"
                        />
                        <span className={isMgr ? "font-bold text-gold-dark" : ""}>Manager</span>
                      </label>
                      <label className="text-[10px] flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSiteMgr}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setField(emp.id, "is_site_manager", v);
                            if (v && (otMult ?? 1.0) < 2.5) setField(emp.id, "ot_max_multiplier", 2.5);
                          }}
                          className="cursor-pointer"
                        />
                        <span className={isSiteMgr ? "font-bold text-orange-700" : ""}>Resp. mag.</span>
                      </label>
                    </div>
                  </td>
                  <td className="text-center px-3 py-2">
                    <div className="inline-flex gap-0.5">
                      {DOW_LABELS.map((lbl, dow) => {
                        const on = offDays.includes(dow);
                        return (
                          <button
                            key={dow}
                            type="button"
                            onClick={() => toggleDow(emp, dow)}
                            className={`w-6 h-7 text-[10px] font-bold rounded border transition-colors ${
                              on
                                ? "bg-violet-light text-violet border-violet-light"
                                : "bg-white text-ink-3 border-line hover:border-gold-dark"
                            }`}
                            title={`Toggle ${lbl}`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <SiteCell
                    sites={sites}
                    selected={prefSites}
                    onToggle={(siteId) => toggleSite(emp, siteId, "preferred")}
                    kind="preferred"
                  />
                  <SiteCell
                    sites={sites}
                    selected={blockSites}
                    onToggle={(siteId) => toggleSite(emp, siteId, "unavailable")}
                    kind="unavailable"
                  />
                  <td className="text-center px-2 py-2">
                    <select
                      value={status}
                      onChange={(e) => setField(emp.id, "status", e.target.value as EmpRow["status"])}
                      className="h-7 px-1 border border-line rounded text-xs"
                      aria-label={`Statut ${emp.full_name}`}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right px-3 py-2">
                    <div className="inline-flex gap-1">
                      {dirty ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reset(emp.id)}
                          disabled={isSaving}
                          title="Annuler les changements"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      ) : null}
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => save(emp)}
                        disabled={!dirty || isSaving}
                        title={dirty ? "Sauver" : "Pas de changement"}
                      >
                        {isSaving ? (
                          <Check className="h-3 w-3 animate-pulse" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Karim 15/05 : potentiometre niveau OT par employe. Range 1.0..2.0
 *  step 0.05. Visualisation live du max d heures autorisees =
 *  weekly_hours * multiplier. Couleur graduee gris -> ambre -> rouge. */
function OTLevelSlider({
  value,
  weeklyHours,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  weeklyHours: number;
  onChange: (v: number) => void;
  "aria-label"?: string;
}) {
  const clamped = Math.max(1.0, Math.min(2.0, value));
  const maxHours = weeklyHours * clamped;
  const fillPct = ((clamped - 1.0) / 1.0) * 100; // 0% a x1.0, 100% a x2.0
  const tone =
    clamped <= 1.001
      ? "bg-ink-3/30 text-ink-3"
      : clamped < 1.3
        ? "bg-success text-white"
        : clamped < 1.6
          ? "bg-gold text-[#1a1a0d]"
          : clamped < 1.85
            ? "bg-orange-500 text-white"
            : "bg-danger text-white";
  return (
    <div className="flex flex-col items-stretch gap-0.5">
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={1.0}
          max={2.0}
          step={0.05}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={ariaLabel}
          className="flex-1 h-1.5 cursor-pointer accent-gold"
          style={{
            // Permet une zone tactile plus large sur mobile
            paddingBlock: "6px",
          }}
        />
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${tone}`}>
          ×{clamped.toFixed(2)}
        </span>
      </div>
      <div className="text-[9px] text-ink-3 leading-tight text-center">
        Max {maxHours.toFixed(0)}h/sem
        {clamped <= 1.001 ? <span className="italic"> (non éligible)</span> : null}
      </div>
      <div className="h-0.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            clamped <= 1.001
              ? "bg-ink-3/30"
              : clamped < 1.3
                ? "bg-success"
                : clamped < 1.6
                  ? "bg-gold"
                  : clamped < 1.85
                    ? "bg-orange-500"
                    : "bg-danger"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

function SiteCell({
  sites,
  selected,
  onToggle,
  kind,
}: {
  sites: SiteOption[];
  selected: string[];
  onToggle: (siteId: string) => void;
  kind: "preferred" | "unavailable";
}) {
  return (
    <td className="text-center px-3 py-2">
      <div className="inline-flex gap-0.5 flex-wrap justify-center max-w-[200px]">
        {sites.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={`min-w-[28px] h-7 px-1 text-[10px] font-bold rounded border transition-colors ${
                on
                  ? kind === "preferred"
                    ? "bg-success-light text-success border-success/30"
                    : "bg-danger-light text-danger border-danger/30 line-through"
                  : "bg-white text-ink-3 border-line hover:border-gold-dark"
              }`}
              title={`${s.name} (${s.code}) — toggle ${kind === "preferred" ? "préféré" : "bloqué"}`}
              style={
                on && kind === "preferred"
                  ? { borderColor: s.color ?? undefined }
                  : undefined
              }
            >
              {s.code}
            </button>
          );
        })}
      </div>
    </td>
  );
}
