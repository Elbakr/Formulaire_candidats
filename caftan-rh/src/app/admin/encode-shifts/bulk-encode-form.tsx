"use client";

// Karim 2026-05-28 : formulaire bulk d encodage shifts non pointes.
// Groupe par site, checkbox global "tout selectionner", inputs IN/OUT
// pre-remplis sur heures planifiees, modifiables individuellement,
// bouton "Encoder selectionnes".

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckSquare, Square, Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { bulkEncodeShiftsAction } from "../presence/actions";

type Unpointed = {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteCode: string;
  date: string;
  startTime: string;
  endTime: string;
};

type SiteForGroup = { code: string; name: string; color: string | null };

export function BulkEncodeForm({
  unpointed,
  sitesForGroup,
}: {
  unpointed: Unpointed[];
  sitesForGroup: SiteForGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Permet override individual des heures (key: shiftId)
  const [overrides, setOverrides] = useState<Record<string, { inTime: string; outTime: string }>>({});

  // Grouped by site
  const grouped = useMemo(() => {
    const byCode = new Map<string, Unpointed[]>();
    for (const u of unpointed) {
      const arr = byCode.get(u.siteCode) ?? [];
      arr.push(u);
      byCode.set(u.siteCode, arr);
    }
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [unpointed]);

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === unpointed.length) setSelected(new Set());
    else setSelected(new Set(unpointed.map((u) => u.shiftId)));
  }

  function toggleSite(code: string) {
    const items = grouped.find(([c]) => c === code)?.[1] ?? [];
    const allSelected = items.every((u) => selected.has(u.shiftId));
    const next = new Set(selected);
    if (allSelected) items.forEach((u) => next.delete(u.shiftId));
    else items.forEach((u) => next.add(u.shiftId));
    setSelected(next);
  }

  function setOverride(shiftId: string, field: "inTime" | "outTime", value: string) {
    setOverrides((prev) => ({
      ...prev,
      [shiftId]: {
        ...(prev[shiftId] ?? {
          inTime: unpointed.find((u) => u.shiftId === shiftId)?.startTime ?? "10:00",
          outTime: unpointed.find((u) => u.shiftId === shiftId)?.endTime ?? "19:00",
        }),
        [field]: value,
      },
    }));
  }

  function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Aucun shift sélectionné");
      return;
    }
    const entries = unpointed
      .filter((u) => selected.has(u.shiftId))
      .map((u) => {
        const o = overrides[u.shiftId];
        return {
          employeeId: u.employeeId,
          shiftId: u.shiftId,
          siteId: u.siteId,
          date: u.date,
          inTime: o?.inTime ?? u.startTime,
          outTime: o?.outTime ?? u.endTime,
        };
      });
    startTransition(async () => {
      const res = await bulkEncodeShiftsAction({ entries });
      if (res.errors && res.errors.length > 0) {
        toast.warning(`${res.inserted} OK / ${res.errors.length} erreur(s). Voir console.`);
        console.warn("[bulk-encode] errors:", res.errors);
      } else {
        toast.success(`${res.inserted} shift(s) encodé(s).`);
      }
      setSelected(new Set());
      setOverrides({});
      router.refresh();
    });
  }

  const allSelected = selected.size === unpointed.length && unpointed.length > 0;

  return (
    <div className="space-y-3">
      {/* Barre d action bulk */}
      <Card>
        <div className="px-3 py-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1.5 text-xs font-bold hover:text-gold-dark"
          >
            {allSelected ? <CheckSquare className="h-4 w-4 text-gold-dark" /> : <Square className="h-4 w-4 text-ink-3" />}
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
          <span className="text-xs text-ink-3">
            <span className="font-bold text-ink-1 tabular-nums">{selected.size}</span> / {unpointed.length} sélectionné(s)
          </span>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || selected.size === 0}
            size="sm"
            className="ml-auto"
          >
            <Save className="h-3.5 w-3.5" />
            {pending ? "Encodage…" : `Encoder ${selected.size} shift(s)`}
          </Button>
        </div>
      </Card>

      {/* Groupes par site */}
      {grouped.map(([code, items]) => {
        const site = sitesForGroup.find((s) => s.code === code);
        const allSiteSelected = items.every((u) => selected.has(u.shiftId));
        const someSiteSelected = items.some((u) => selected.has(u.shiftId)) && !allSiteSelected;
        return (
          <Card key={code}>
            <div className="px-3 py-2 border-b border-line flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSite(code)}
                className="inline-flex items-center gap-1.5"
                title={allSiteSelected ? `Désélectionner tout site ${code}` : `Sélectionner tout site ${code}`}
              >
                {allSiteSelected ? (
                  <CheckSquare className="h-4 w-4 text-gold-dark" />
                ) : someSiteSelected ? (
                  <CheckSquare className="h-4 w-4 text-gold-dark/50" />
                ) : (
                  <Square className="h-4 w-4 text-ink-3" />
                )}
              </button>
              <span
                className="inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold text-xs"
                style={{ backgroundColor: site?.color ?? "#666" }}
              >
                {code}
              </span>
              <h3 className="font-bold text-sm">{site?.name ?? code}</h3>
              <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-amber-700">
                {items.length} shift(s)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead className="bg-surface-2/30">
                  <tr className="border-b border-line">
                    <th className="px-2 py-1.5 w-8" />
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">Employé</th>
                    <th className="px-2 py-1.5 text-center">Shift planifié</th>
                    <th className="px-2 py-1.5 text-center">IN à encoder</th>
                    <th className="px-2 py-1.5 text-center">OUT à encoder</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => {
                    const checked = selected.has(u.shiftId);
                    const o = overrides[u.shiftId];
                    return (
                      <tr
                        key={u.shiftId}
                        className={`border-b border-line hover:bg-surface-2/40 ${checked ? "bg-gold/5" : ""}`}
                      >
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(u.shiftId)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{u.date}</td>
                        <td className="px-2 py-1.5">
                          <Link
                            href={`/planning/employees/${u.employeeId}/prestations?view=day&date=${u.date}`}
                            className="text-blue-700 font-bold hover:underline"
                          >
                            {u.employeeName}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-center font-mono text-[11px] text-ink-3">
                          {u.startTime}–{u.endTime}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="time"
                            value={o?.inTime ?? u.startTime}
                            onChange={(e) => setOverride(u.shiftId, "inTime", e.target.value)}
                            className="px-1 py-0.5 rounded border border-line bg-surface text-xs w-24"
                            step={60}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="time"
                            value={o?.outTime ?? u.endTime}
                            onChange={(e) => setOverride(u.shiftId, "outTime", e.target.value)}
                            className="px-1 py-0.5 rounded border border-line bg-surface text-xs w-24"
                            step={60}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
