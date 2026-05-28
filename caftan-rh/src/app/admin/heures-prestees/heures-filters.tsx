"use client";

// Karim 2026-05-25 : filtres de la page heures-prestees.
// Tabs vue (jour/semaine/mois/custom) + raccourcis 7j/14j/30j/60j/90j
// + toggle scope ville/tous

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type View = "day" | "week" | "month" | "custom";
type Scope = "city" | "all";

export function HeuresFilters({
  initial,
}: {
  initial: { view: View; date?: string; from?: string; to?: string; scope: Scope };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<View>(initial.view);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [from, setFrom] = useState<string>(initial.from ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(initial.to ?? new Date().toISOString().slice(0, 10));
  const [pickerDate, setPickerDate] = useState<string>(initial.date ?? new Date().toISOString().slice(0, 10));

  function update(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  function switchView(v: View) {
    setView(v);
    update({ view: v });
  }

  function switchScope(s: Scope) {
    setScope(s);
    update({ scope: s });
  }

  function applyShortcut(days: number) {
    const t = new Date();
    const f = new Date(Date.now() - (days - 1) * 86400_000);
    const fs = f.toISOString().slice(0, 10);
    const ts = t.toISOString().slice(0, 10);
    setView("custom");
    setFrom(fs);
    setTo(ts);
    update({ view: "custom", from: fs, to: ts, date: undefined });
  }

  function applyCustom() {
    update({ view: "custom", from, to, date: undefined });
  }

  function navDate(days: number) {
    const d = new Date(pickerDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    const next = d.toISOString().slice(0, 10);
    setPickerDate(next);
    update({ date: next });
  }

  function applyPickerDate() {
    update({ date: pickerDate });
  }

  const step = view === "month" ? 30 : view === "week" ? 7 : 1;
  const stepLabel = view === "month" ? "mois" : view === "week" ? "semaine" : "jour";

  return (
    <div className="flex flex-wrap items-center gap-3 p-2 bg-surface-2/50 rounded-md border border-line">
      {/* Tabs vue */}
      <div className="inline-flex bg-surface rounded-md border border-line p-0.5">
        {(["day", "week", "month", "custom"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => switchView(v)}
            className={`px-2 py-1 text-xs font-bold rounded ${
              view === v ? "bg-gold text-[#1a1a0d]" : "text-ink-3 hover:text-ink-1"
            }`}
          >
            {v === "day" ? "Jour" : v === "week" ? "Semaine" : v === "month" ? "Mois" : "Période…"}
          </button>
        ))}
      </div>

      {/* Toggle scope */}
      <div className="inline-flex bg-surface rounded-md border border-line p-0.5">
        <button type="button" onClick={() => switchScope("city")} className={`px-2 py-1 text-xs font-bold rounded ${scope === "city" ? "bg-gold text-[#1a1a0d]" : "text-ink-3 hover:text-ink-1"}`}>
          Ville courante
        </button>
        <button type="button" onClick={() => switchScope("all")} className={`px-2 py-1 text-xs font-bold rounded ${scope === "all" ? "bg-gold text-[#1a1a0d]" : "text-ink-3 hover:text-ink-1"}`}>
          Tous sites
        </button>
      </div>

      {/* Navigation date pour jour/semaine/mois */}
      {view !== "custom" ? (
        <div className="inline-flex items-center gap-1 ml-auto">
          <button type="button" onClick={() => navDate(-step)} title={`${stepLabel} précédent`} className="px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input type="date" value={pickerDate} onChange={(e) => { setPickerDate(e.target.value); }} onBlur={applyPickerDate} className="text-xs px-2 py-1 rounded border border-line bg-surface" />
          <button type="button" onClick={() => navDate(step)} title={`${stepLabel} suivant`} className="px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => { const t = new Date().toISOString().slice(0,10); setPickerDate(t); update({ date: t }); }} className="text-[10px] px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2 font-bold">
            Aujourd'hui
          </button>
        </div>
      ) : null}

      {view === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="text-[10px] text-ink-3 uppercase tracking-wider font-bold flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Du
          </span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs px-2 py-1 rounded border border-line bg-surface" />
          <span className="text-[10px] text-ink-3 uppercase font-bold">au</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs px-2 py-1 rounded border border-line bg-surface" />
          <button type="button" onClick={applyCustom} className="text-xs px-3 py-1 rounded bg-gold text-[#1a1a0d] font-bold">
            Appliquer
          </button>
          <div className="flex items-center gap-1">
            {[7, 14, 30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => applyShortcut(d)}
                className="text-[10px] px-2 py-1 rounded border border-line bg-surface hover:bg-surface-2 font-bold"
              >
                {d}j
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
