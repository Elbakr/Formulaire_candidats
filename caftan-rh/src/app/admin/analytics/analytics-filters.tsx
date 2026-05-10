"use client";

// Period selector for the analytics dashboard.
//
// Updates ?period=... (and optional ?from / ?to for "custom") in the URL.
// The server page reads these and computes the date bounds.

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type PeriodKey =
  | "this_week"
  | "this_month"
  | "last_30d"
  | "this_quarter"
  | "this_year"
  | "custom";

const OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "this_week", label: "Cette semaine" },
  { value: "this_month", label: "Ce mois" },
  { value: "last_30d", label: "30 derniers jours" },
  { value: "this_quarter", label: "Ce trimestre" },
  { value: "this_year", label: "Cette année" },
  { value: "custom", label: "Plage personnalisée" },
];

export function AnalyticsFilters({
  period,
  from,
  to,
}: {
  period: PeriodKey;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: Partial<{ period: PeriodKey; from: string; to: string }>) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next.period) {
      sp.set("period", next.period);
      if (next.period !== "custom") {
        sp.delete("from");
        sp.delete("to");
      }
    }
    if (next.from !== undefined) sp.set("from", next.from);
    if (next.to !== undefined) sp.set("to", next.to);
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" data-pending={pending ? "" : undefined}>
      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3">Période</span>
      <Select value={period} onValueChange={(v) => update({ period: v as PeriodKey })}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === "custom" ? (
        <>
          <Input
            type="date"
            value={from}
            onChange={(e) => update({ from: e.target.value })}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-xs text-ink-3">→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => update({ to: e.target.value })}
            className="h-8 w-[140px] text-xs"
          />
        </>
      ) : null}
      {pending ? <span className="text-[10px] text-ink-3 ml-1">…</span> : null}
    </div>
  );
}
