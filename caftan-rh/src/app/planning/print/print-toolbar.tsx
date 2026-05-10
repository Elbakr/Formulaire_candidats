"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";

type Period = "week" | "3weeks" | "month";

export function PrintToolbar({
  mondayISO,
  period,
}: {
  mondayISO: string;
  period: Period;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setPeriod(p: Period) {
    const sp = new URLSearchParams(params.toString());
    sp.set("period", p);
    sp.set("week", mondayISO);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  const tabs: { value: Period; label: string }[] = [
    { value: "week", label: "Semaine" },
    { value: "3weeks", label: "3 semaines" },
    { value: "month", label: "Mois (4 sem.)" },
  ];

  return (
    <div className="flex items-center justify-between mb-4 print:hidden">
      <Link
        href={`/planning/calendar?week=${mondayISO}`}
        className="text-sm text-gold-dark font-bold inline-flex items-center gap-2 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au planning éditable
      </Link>
      <div className="flex gap-2 items-center">
        <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setPeriod(t.value)}
              className={`px-3 py-1.5 font-bold transition-colors ${
                period === t.value
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-ink-2 hover:bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className="bg-gold text-[#1a1a0d] font-bold rounded-md px-4 py-2 inline-flex items-center gap-2"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>
    </div>
  );
}
