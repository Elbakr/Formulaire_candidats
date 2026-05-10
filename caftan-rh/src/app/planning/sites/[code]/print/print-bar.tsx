"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

export function SitePrintBar({
  weeks,
}: {
  siteCode: string;
  weeks: number;
  weekISO: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setWeeks(n: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("weeks", String(n));
    router.replace(`${pathname}?${next.toString()}`);
  }

  const tabs = [
    { v: 1, label: "1 sem" },
    { v: 3, label: "3 sem" },
    { v: 4, label: "4 sem" },
  ];

  return (
    <div className="flex gap-2 items-center">
      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
        {tabs.map((t) => (
          <button
            key={t.v}
            onClick={() => setWeeks(t.v)}
            className={`px-3 py-1.5 font-bold transition-colors ${
              weeks === t.v
                ? "bg-gold text-[#1a1a0d]"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => window.print()}
        className="bg-gold text-[#1a1a0d] font-bold rounded-md px-4 py-2 inline-flex items-center gap-2 text-sm"
      >
        <Printer className="h-4 w-4" /> Imprimer
      </button>
    </div>
  );
}
