"use client";

import { useState, useTransition } from "react";
import { Archive, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { archiveEmployeeAction } from "./actions";

type Emp = {
  id: string;
  full_name: string;
  email: string | null;
  nrn: string | null;
  phone: string | null;
  birth_date: string | null;
  status: string;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  profile_id: string | null;
  candidate_id: string | null;
};

export function DuplicateEmployeesTable({
  criterion,
  groupKey,
  emps,
}: {
  criterion: string;
  groupKey: string;
  emps: Emp[];
}) {
  const [archivedSet, setArchivedSet] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleArchive(id: string, name: string) {
    const reason = prompt(`Archiver ${name} (status=archived).\nRaison ?`);
    if (!reason || reason.trim().length < 3) return;
    setPendingId(id);
    startTransition(async () => {
      const r = await archiveEmployeeAction({ employeeId: id, reason });
      if (r.ok) {
        toast.success(`✓ ${name} archivé`);
        setArchivedSet((s) => new Set([...s, id]));
      } else {
        toast.error(r.error ?? "Erreur");
      }
      setPendingId(null);
    });
  }

  const visibleEmps = emps.filter((e) => !archivedSet.has(e.id));
  if (visibleEmps.length < 2) return null;

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="bg-rose-50 border-b border-rose-200 px-3 py-2 text-xs">
        <span className="font-semibold text-rose-900">{criterion}</span>
        <span className="text-rose-700 ml-2">→ {groupKey}</span>
        <span className="ml-2 text-rose-700">({visibleEmps.length} rows)</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-surface border-b border-line">
          <tr className="text-left">
            <th className="px-2 py-1">Nom / Email</th>
            <th className="px-2 py-1">NRN</th>
            <th className="px-2 py-1">Naissance</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Contrat</th>
            <th className="px-2 py-1">Période</th>
            <th className="px-2 py-1">Profile / Cand.</th>
            <th className="px-2 py-1 w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleEmps.map((e, i) => {
            const isBest = i === 0;
            return (
              <tr key={e.id} className={isBest ? "bg-emerald-50" : ""}>
                <td className="px-2 py-1.5">
                  <div className="font-semibold">{e.full_name}</div>
                  <div className="text-ink-3 text-[10px]">{e.email ?? "—"}</div>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{e.nrn ?? "—"}</td>
                <td className="px-2 py-1.5">{e.birth_date ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${e.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-2 py-1.5">{e.contract_type ?? "—"}{e.weekly_hours ? ` (${e.weekly_hours}h)` : ""}</td>
                <td className="px-2 py-1.5 text-[10px] text-ink-3">
                  {e.start_date ?? "?"} → {e.end_date ?? "∞"}
                </td>
                <td className="px-2 py-1.5">
                  {e.profile_id ? <span title="Profile lié">👤</span> : ""}
                  {e.candidate_id ? <span title="Candidate lié" className="ml-1">📝</span> : ""}
                </td>
                <td className="px-2 py-1.5 space-x-1">
                  <a
                    href={`/planning/employees/${e.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 border border-line rounded text-[10px] hover:bg-surface"
                  >
                    <ExternalLink className="h-3 w-3" /> Fiche
                  </a>
                  {!isBest && e.status !== "archived" && (
                    <button
                      type="button"
                      onClick={() => handleArchive(e.id, e.full_name)}
                      disabled={pendingId === e.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-300 bg-amber-50 text-amber-800 rounded text-[10px] hover:bg-amber-100 disabled:opacity-50"
                    >
                      {pendingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                      Archiver
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
