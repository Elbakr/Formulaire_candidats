"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type ShiftFilter = "all" | "contract" | "overtime";

export function FilterTabs({ current }: { current: ShiftFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setFilter(f: ShiftFilter) {
    const next = new URLSearchParams(sp.toString());
    if (f === "all") next.delete("filter");
    else next.set("filter", f);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const tabs: { v: ShiftFilter; label: string; cls: string }[] = [
    {
      v: "all",
      label: "Global",
      cls:
        current === "all"
          ? "bg-ink text-white"
          : "bg-white text-ink-2 hover:bg-surface-2",
    },
    {
      v: "contract",
      label: "Contractuel",
      cls:
        current === "contract"
          ? "bg-gold text-[#1a1a0d]"
          : "bg-white text-ink-2 hover:bg-surface-2",
    },
    {
      v: "overtime",
      label: "Heures sup.",
      cls:
        current === "overtime"
          ? "bg-orange-500 text-white"
          : "bg-white text-ink-2 hover:bg-surface-2",
    },
  ];

  return (
    <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
      {tabs.map((t) => (
        <button
          key={t.v}
          onClick={() => setFilter(t.v)}
          className={`px-3 py-1.5 font-bold transition-colors ${t.cls}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
