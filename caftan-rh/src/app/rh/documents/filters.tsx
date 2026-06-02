"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TYPES = [
  { id: "payslip", label: "Fiches paie" },
  { id: "contract", label: "Contrats" },
  { id: "termination", label: "Ruptures" },
  { id: "cv", label: "CV" },
  { id: "screening", label: "Screening" },
];

const MONTHS = [
  { v: "01", l: "Jan" }, { v: "02", l: "Fév" }, { v: "03", l: "Mar" }, { v: "04", l: "Avr" },
  { v: "05", l: "Mai" }, { v: "06", l: "Juin" }, { v: "07", l: "Juil" }, { v: "08", l: "Août" },
  { v: "09", l: "Sept" }, { v: "10", l: "Oct" }, { v: "11", l: "Nov" }, { v: "12", l: "Déc" },
];

interface Props {
  employees: Array<{ id: string; full_name: string }>;
  currentEmployee: string;
  currentYear: string;
  currentMonth: string;
  currentTypes: string[];
  counts: Map<string, number>;
}

export function DocumentsFilters({ employees, currentEmployee, currentYear, currentMonth, currentTypes }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const p = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/rh/documents?${p.toString()}`);
  }

  function toggleType(t: string) {
    const next = currentTypes.includes(t)
      ? currentTypes.filter((x) => x !== t)
      : [...currentTypes, t];
    update({ types: next.length === 0 ? null : next.join(",") });
  }

  // Year range : current ± 3
  const nowY = new Date().getFullYear();
  const years = [nowY - 2, nowY - 1, nowY, nowY + 1];

  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-ink-3 font-semibold">Employé :</span>
          <select
            value={currentEmployee}
            onChange={(e) => update({ employee: e.target.value || null })}
            className="border border-line rounded px-2 py-1 text-xs bg-surface"
          >
            <option value="">Tous</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <span className="text-ink-3">·</span>
        <div className="flex items-center gap-1">
          <span className="text-ink-3 font-semibold">Année :</span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => update({ year: currentYear === String(y) ? null : String(y) })}
              className={`px-2 py-0.5 rounded text-[11px] ${
                currentYear === String(y) ? "bg-foreground text-background" : "bg-muted"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <span className="text-ink-3">·</span>
        <div className="flex items-center gap-0.5 flex-wrap">
          <span className="text-ink-3 font-semibold mr-1">Mois :</span>
          {MONTHS.map((m) => (
            <button
              key={m.v}
              onClick={() => update({ month: currentMonth === m.v ? null : m.v })}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                currentMonth === m.v ? "bg-foreground text-background" : "bg-muted"
              }`}
            >
              {m.l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-3 font-semibold">Types :</span>
        {TYPES.map((t) => {
          const on = currentTypes.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleType(t.id)}
              className={`px-2 py-0.5 rounded-full text-[11px] border ${
                on ? "bg-foreground text-background border-foreground" : "bg-surface border-line"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        {(currentEmployee || currentYear || currentMonth || currentTypes.length > 0) && (
          <button
            onClick={() => update({ employee: null, year: null, month: null, types: null })}
            className="text-[11px] text-blue-700 underline hover:text-blue-900 ml-2"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
