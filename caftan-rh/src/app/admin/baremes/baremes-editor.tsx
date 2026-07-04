"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertBaremeAction, deleteBaremeAction } from "./actions";

type Row = { id: string; contract_kind: string; age_min: number | null; age_max: number | null; hourly_rate: number; label: string | null };

const KINDS = ["default", "Étudiant", "CDD", "CDI", "Extra"];

export function BaremesEditor({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState({ contract_kind: "Étudiant", age_min: "", age_max: "", hourly_rate: "", label: "" });

  function add() {
    const hr = parseFloat(draft.hourly_rate.replace(",", "."));
    if (!hr || hr <= 0) { toast.error("Taux horaire requis."); return; }
    start(async () => {
      const r = await upsertBaremeAction({
        contract_kind: draft.contract_kind,
        age_min: draft.age_min ? parseInt(draft.age_min, 10) : null,
        age_max: draft.age_max ? parseInt(draft.age_max, 10) : null,
        hourly_rate: hr,
        label: draft.label || null,
      });
      if (r.ok) { toast.success("Barème enregistré."); setDraft({ contract_kind: "Étudiant", age_min: "", age_max: "", hourly_rate: "", label: "" }); }
      else toast.error(r.error ?? "Échec.");
    });
  }

  function remove(id: string) {
    if (!confirm("Supprimer ce barème ?")) return;
    start(async () => {
      const r = await deleteBaremeAction(id);
      if (r.ok) toast.success("Supprimé."); else toast.error(r.error ?? "Échec.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line p-3 bg-surface">
        <div className="font-bold text-sm mb-2 flex items-center gap-1"><Plus className="h-4 w-4" /> Ajouter un barème</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <label className="text-xs">Type
            <select value={draft.contract_kind} onChange={(e) => setDraft({ ...draft, contract_kind: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-line px-2 py-1.5 text-sm">
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-xs">Âge min<Input value={draft.age_min} onChange={(e) => setDraft({ ...draft, age_min: e.target.value })} placeholder="—" inputMode="numeric" /></label>
          <label className="text-xs">Âge max<Input value={draft.age_max} onChange={(e) => setDraft({ ...draft, age_max: e.target.value })} placeholder="—" inputMode="numeric" /></label>
          <label className="text-xs">€ brut / h<Input value={draft.hourly_rate} onChange={(e) => setDraft({ ...draft, hourly_rate: e.target.value })} placeholder="13.50" inputMode="decimal" /></label>
          <label className="text-xs col-span-2 md:col-span-1">Libellé<Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="CP201 étudiant" /></label>
          <Button size="sm" variant="gold" disabled={pending} onClick={add}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ajouter"}</Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">Âge vide = s&apos;applique à tous les âges. Type « default » = plancher par défaut si aucun type précis ne correspond.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-ink-3 text-left text-xs"><tr><th className="py-1 pr-3">Type</th><th className="pr-3">Âge</th><th className="pr-3">€ brut / h</th><th className="pr-3">Libellé</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="py-3 text-ink-3">Aucun barème. Ajoute au moins un plancher (ex. type « default »).</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1.5 pr-3 font-semibold">{r.contract_kind}</td>
                <td className="pr-3">{r.age_min ?? "–"}{(r.age_min != null || r.age_max != null) ? ` → ${r.age_max ?? "∞"}` : " (tous)"}</td>
                <td className="pr-3 font-mono">{Number(r.hourly_rate).toFixed(2)} €</td>
                <td className="pr-3 text-ink-2">{r.label ?? "—"}</td>
                <td className="text-right"><button onClick={() => remove(r.id)} className="text-red-600 hover:text-red-800 p-1"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
