"use client";

import Link from "next/link";

interface Counts { active: number; pending: number; signed: number; closed: number; all: number }

export function TerminationsFilters({ current, counts }: { current: string; counts: Counts }) {
  const filters = [
    { key: "active", label: "Actives", count: counts.active },
    { key: "pending", label: "Worker à valider", count: counts.pending },
    { key: "signed", label: "Signées", count: counts.signed },
    { key: "closed", label: "Refusées/Annulées", count: counts.closed },
    { key: "all", label: "Toutes", count: counts.all },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <Link
          key={f.key}
          href={`/rh/terminations?status=${f.key}`}
          className={`px-3 py-1.5 text-xs rounded-full font-semibold border ${
            current === f.key
              ? "bg-foreground text-background border-foreground"
              : "bg-surface border-line hover:bg-muted"
          }`}
        >
          {f.label}
          <span className="ml-1.5 opacity-70">({f.count})</span>
        </Link>
      ))}
    </div>
  );
}
