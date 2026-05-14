"use client";
// Sélecteur de période URL-driven (?period=...).
// Server component parent lit la query et passe le résultat au reste.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const OPTIONS: { value: string; label: string; sub?: string }[] = [
  { value: "this_week", label: "Semaine en cours" },
  { value: "next_week", label: "Semaine prochaine" },
  { value: "4w", label: "4 semaines" },
  { value: "12w", label: "12 semaines" },
  { value: "this_month", label: "Mois en cours" },
];

export function PeriodSelector({ current }: { current: string }) {
  const sp = useSearchParams();
  function hrefFor(value: string): string {
    const params = new URLSearchParams(sp.toString());
    params.set("period", value);
    return `?${params.toString()}`;
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface text-xs overflow-x-auto scroll-smooth-touch -mx-1 px-1 max-w-full">
      {OPTIONS.map((o) => {
        const isCurrent = current === o.value;
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            scroll={false}
            className={`whitespace-nowrap px-3 py-1.5 font-bold transition-colors shrink-0 ${
              isCurrent
                ? "bg-gold text-[#1a1a0d]"
                : "bg-white text-ink-2 hover:bg-surface-2"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
