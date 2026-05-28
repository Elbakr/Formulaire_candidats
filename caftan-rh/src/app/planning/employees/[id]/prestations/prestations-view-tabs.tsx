"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PrestationsView = "day" | "week" | "month" | "custom";

export function PrestationsViewTabs({
  current,
  dateISO,
  prevDateISO,
  nextDateISO,
  todayISO,
  customFrom,
  customTo,
}: {
  current: PrestationsView;
  dateISO: string;
  prevDateISO: string;
  nextDateISO: string;
  todayISO: string;
  customFrom?: string;
  customTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fromInput, setFromInput] = useState(customFrom ?? todayISO);
  const [toInput, setToInput] = useState(customTo ?? todayISO);

  function setView(v: PrestationsView) {
    const next = new URLSearchParams(sp.toString());
    next.set("view", v);
    if (v === "custom") {
      next.set("from", fromInput);
      next.set("to", toInput);
      next.delete("date");
      setPickerOpen(true);
    } else {
      next.set("date", dateISO);
      next.delete("from");
      next.delete("to");
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function applyCustom() {
    if (!fromInput || !toInput) return;
    if (fromInput > toInput) return;
    const next = new URLSearchParams(sp.toString());
    next.set("view", "custom");
    next.set("from", fromInput);
    next.set("to", toInput);
    next.delete("date");
    router.replace(`${pathname}?${next.toString()}`);
    setPickerOpen(false);
  }

  const tabs: { v: PrestationsView; label: string }[] = [
    { v: "day", label: "Jour" },
    { v: "week", label: "Semaine" },
    { v: "month", label: "Mois" },
    { v: "custom", label: "Période…" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
          {tabs.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => (t.v === "custom" ? setPickerOpen((v) => !v) : setView(t.v))}
              className={`px-3 py-1.5 font-bold transition-colors ${
                current === t.v
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-ink-2 hover:bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {current !== "custom" ? (
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" title="Précédent">
              <Link href={`?view=${current}&date=${prevDateISO}`}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`?view=${current}&date=${todayISO}`}>Aujourd&apos;hui</Link>
            </Button>
            <Button asChild variant="outline" size="sm" title="Suivant">
              <Link href={`?view=${current}&date=${nextDateISO}`}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {pickerOpen || current === "custom" ? (
        <div className="flex items-center flex-wrap gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs">
          <CalendarIcon className="h-3.5 w-3.5 text-ink-3" />
          <label className="inline-flex items-center gap-1">
            Du
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="rounded border border-line px-2 py-1 bg-white text-xs"
            />
          </label>
          <label className="inline-flex items-center gap-1">
            au
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="rounded border border-line px-2 py-1 bg-white text-xs"
            />
          </label>
          <Button variant="gold" size="sm" onClick={applyCustom}>
            Appliquer
          </Button>
          {/* Raccourcis fréquents */}
          <span className="text-ink-3 ml-2">Raccourcis :</span>
          {[
            { label: "7 derniers j", days: 7 },
            { label: "14 derniers j", days: 14 },
            { label: "30 derniers j", days: 30 },
            { label: "60 derniers j", days: 60 },
            { label: "90 derniers j", days: 90 },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                const to = new Date();
                const from = new Date();
                from.setDate(from.getDate() - q.days + 1);
                const f = from.toISOString().slice(0, 10);
                const t = to.toISOString().slice(0, 10);
                setFromInput(f);
                setToInput(t);
                const next = new URLSearchParams(sp.toString());
                next.set("view", "custom");
                next.set("from", f);
                next.set("to", t);
                next.delete("date");
                router.replace(`${pathname}?${next.toString()}`);
                setPickerOpen(false);
              }}
              className="rounded border border-line bg-white px-2 py-0.5 hover:bg-surface-2 text-[11px]"
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
