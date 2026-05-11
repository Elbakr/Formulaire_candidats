"use client";

/**
 * Filtres URL pour /admin/overtime-audit.
 * - period : "this_week" | "next_week" | "last_4w" | "next_8w"
 * - sites : liste de codes de sites séparés par virgule (ex: "ANT,BXL")
 * - contract : "all" | "cdi" | "cdd" | "student"
 */

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type PeriodKey = "this_week" | "next_week" | "last_4w" | "next_8w";

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "this_week", label: "Cette semaine" },
  { value: "next_week", label: "Semaine prochaine" },
  { value: "last_4w", label: "4 dernières semaines" },
  { value: "next_8w", label: "8 prochaines semaines" },
];

const CONTRACT_OPTIONS = [
  { value: "all", label: "Tous contrats" },
  { value: "cdi", label: "CDI" },
  { value: "cdd", label: "CDD" },
  { value: "student", label: "Étudiant" },
];

export function OvertimeAuditFilters({
  period,
  contract,
  selectedSites,
  allSites,
  csvHref,
}: {
  period: PeriodKey;
  contract: string;
  selectedSites: string[];
  allSites: Array<{ id: string; code: string; name: string }>;
  csvHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  function toggleSite(code: string) {
    const next = new Set(selectedSites);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setParam("sites", next.size === 0 ? null : Array.from(next).join(","));
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      data-pending={pending ? "" : undefined}
    >
      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
        Période
      </span>
      <Select
        value={period}
        onValueChange={(v) => setParam("period", v)}
      >
        <SelectTrigger className="w-[200px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3 ml-2">
        Contrat
      </span>
      <Select value={contract} onValueChange={(v) => setParam("contract", v)}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONTRACT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3 ml-2">
        Sites
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {allSites.map((s) => {
          const on = selectedSites.includes(s.code);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSite(s.code)}
              className={`h-8 px-2 rounded-md border-[1.5px] text-xs font-bold transition-colors ${
                on
                  ? "border-gold bg-gold-light text-gold-dark"
                  : "border-line bg-surface text-ink-3 hover:border-gold"
              }`}
              aria-pressed={on}
              title={s.name}
            >
              {s.code}
            </button>
          );
        })}
        {selectedSites.length > 0 ? (
          <button
            type="button"
            onClick={() => setParam("sites", null)}
            className="h-8 px-2 text-xs text-ink-3 hover:text-danger"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="ml-auto">
        <Button asChild variant="outline" size="sm">
          <a href={csvHref}>Exporter CSV</a>
        </Button>
      </div>

      {pending ? (
        <span className="text-[10px] text-ink-3 ml-1">…</span>
      ) : null}
    </div>
  );
}
