"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  previewMultiSitePlanAction,
  commitMultiSitePlanAction,
} from "@/app/planning/auto-drafts/actions";
import type { SitePlanPreview } from "@/app/planning/sites/[code]/actions";

type SiteOption = { id: string; code: string; name: string; color: string | null };

const SITES_PREF_KEY = "gen_week_sites_pref";
const WEEKS_PREF_KEY = "gen_week_count_pref";

const WEEK_OPTIONS = [
  { value: 1, label: "1 semaine" },
  { value: 2, label: "2 semaines" },
  { value: 4, label: "4 semaines (1 mois)" },
  { value: 12, label: "12 semaines (1 trimestre)" },
];

type PreviewRow = {
  site_id: string;
  site_code: string;
  site_name: string;
  site_color: string | null;
  week_monday: string;
  preview?: SitePlanPreview;
  error?: string;
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function GenerateWeekDialog({
  open,
  onOpenChange,
  sites,
  mondayISO,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sites: SiteOption[];
  mondayISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weeksCount, setWeeksCount] = useState<number>(1);
  const [previews, setPreviews] = useState<PreviewRow[] | null>(null);
  const [phase, setPhase] = useState<"select" | "preview">("select");

  // Charge les prefs localStorage a l'ouverture (sites + periode)
  useEffect(() => {
    if (!open) return;
    // Sites
    try {
      const raw = localStorage.getItem(SITES_PREF_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        const valid = ids.filter((id) => sites.some((s) => s.id === id));
        if (valid.length > 0) {
          setSelected(new Set(valid));
        } else {
          setSelected(new Set(sites.map((s) => s.id)));
        }
      } else {
        setSelected(new Set(sites.map((s) => s.id)));
      }
    } catch {
      setSelected(new Set(sites.map((s) => s.id)));
    }
    // Periode
    try {
      const raw = localStorage.getItem(WEEKS_PREF_KEY);
      if (raw) {
        const n = Number(raw);
        if (WEEK_OPTIONS.some((o) => o.value === n)) {
          setWeeksCount(n);
        }
      }
    } catch {
      /* noop */
    }
  }, [open, sites]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPreview() {
    const codes = sites.filter((s) => selected.has(s.id)).map((s) => s.code);
    if (codes.length === 0) {
      toast.error("Coche au moins un site.");
      return;
    }
    // Persiste les prefs (sites + periode)
    try {
      localStorage.setItem(SITES_PREF_KEY, JSON.stringify(Array.from(selected)));
      localStorage.setItem(WEEKS_PREF_KEY, String(weeksCount));
    } catch {
      /* noop */
    }
    // Calcule les lundis pour chaque semaine de la periode
    const weekMondays: string[] = [];
    for (let i = 0; i < weeksCount; i++) {
      weekMondays.push(addDaysISO(mondayISO, i * 7));
    }
    startTransition(async () => {
      // Pour chaque semaine, preview multi-sites en parallele
      const allRows: PreviewRow[] = [];
      for (const wm of weekMondays) {
        const r = await previewMultiSitePlanAction(codes, wm);
        for (const it of r.items) {
          const site = sites.find((s) => s.code === it.site_code)!;
          allRows.push({
            site_id: site.id,
            site_code: site.code,
            site_name: site.name,
            site_color: site.color,
            week_monday: wm,
            preview: it.preview,
            error: it.error,
          });
        }
      }
      setPreviews(allRows);
      setPhase("preview");
    });
  }

  function onApply() {
    if (!previews) return;
    const items = previews
      .filter((p) => p.preview && p.preview.drafts.length > 0)
      .map((p) => ({
        site_id: p.site_id,
        site_code: p.site_code,
        week_monday: p.week_monday,
        drafts: p.preview!.drafts,
        uncovered: p.preview!.uncovered,
        contract_usage: p.preview!.contract_usage,
      }));
    if (items.length === 0) {
      toast.error("Aucun draft à appliquer.");
      return;
    }
    startTransition(async () => {
      const r = await commitMultiSitePlanAction(items);
      const ok = r.results.filter((x) => x.ok).length;
      const failed = r.results.filter((x) => x.error);
      const totalCreated = r.results.reduce((a, x) => a + (x.created ?? 0), 0);
      if (failed.length > 0) {
        toast.error(`${ok}/${r.results.length} drafts OK. Échecs : ${failed.map((f) => f.site_code).join(", ")}`);
      } else {
        toast.success(`${ok} drafts validés sur ${weeksCount} semaine${weeksCount > 1 ? "s" : ""} · ${totalCreated} shifts créés. Bouton ⮌ visible pour annuler.`);
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function backToSelect() {
    setPhase("select");
    setPreviews(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-dark" />
            Générer le planning
          </DialogTitle>
          <DialogDescription>
            À partir du {new Date(mondayISO + "T00:00:00").toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
            {weeksCount > 1 ? ` (sur ${weeksCount} semaines)` : ""}
            {phase === "select"
              ? " · choisis les sites et la période"
              : " · vérifie puis valide"}
          </DialogDescription>
        </DialogHeader>

        {phase === "select" ? (
          <div className="space-y-4 max-h-96 overflow-auto">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">📍 Sites à inclure</h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(sites.map((s) => s.id)))}
                    className="text-[11px] text-gold-dark hover:underline"
                  >
                    Tout cocher
                  </button>
                  <span className="text-[11px] text-ink-3">·</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-[11px] text-gold-dark hover:underline"
                  >
                    Décocher
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {sites.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                        checked ? "border-gold bg-gold-light/30" : "border-line hover:bg-surface-2"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span
                        className="inline-flex items-center justify-center px-1.5 rounded text-white font-bold text-[10px] min-w-[24px]"
                        style={{ backgroundColor: s.color ?? "#666" }}
                      >
                        {s.code}
                      </span>
                      <span className="flex-1 font-bold text-sm truncate">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm mb-2">📅 Période à générer</h3>
              <div className="grid grid-cols-2 gap-2">
                {WEEK_OPTIONS.map((opt) => {
                  const active = weeksCount === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWeeksCount(opt.value)}
                      className={`p-2 rounded border text-sm font-bold transition-colors text-left ${
                        active
                          ? "border-gold bg-gold-light/30 text-gold-dark"
                          : "border-line hover:bg-surface-2"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-ink-3 italic">
              Tes choix (sites + période) sont mémorisés pour la prochaine fois.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-auto">
            {(() => {
              if (!previews) return null;
              // Regroupe par semaine
              const byWeek = new Map<string, PreviewRow[]>();
              for (const p of previews) {
                const arr = byWeek.get(p.week_monday) ?? [];
                arr.push(p);
                byWeek.set(p.week_monday, arr);
              }
              const weekKeys = [...byWeek.keys()].sort();
              return weekKeys.map((wm) => {
                const rows = byWeek.get(wm)!;
                const wmLabel = new Date(wm + "T00:00:00").toLocaleDateString("fr-BE", { day: "2-digit", month: "long" });
                return (
                  <div key={wm}>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                      Semaine du {wmLabel}
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((p) => {
                        if (p.error) {
                          return (
                            <div key={`${p.site_code}-${wm}`} className="rounded border border-danger/40 bg-danger-light/30 p-2 text-xs">
                              <div className="font-bold text-danger flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {p.site_code} · {p.error}
                              </div>
                            </div>
                          );
                        }
                        if (!p.preview) return null;
                        const totalShifts = p.preview.drafts.length;
                        const totalUncovered = p.preview.uncovered.reduce((a, u) => a + u.missing, 0);
                        const hours = p.preview.drafts.reduce((a, d) => {
                          const [sh, sm] = d.start_time.split(":").map(Number);
                          const [eh, em] = d.end_time.split(":").map(Number);
                          return a + (eh * 60 + em - sh * 60 - sm - (d.break_minutes ?? 0)) / 60;
                        }, 0);
                        return (
                          <div key={`${p.site_code}-${wm}`} className="rounded border border-line p-2 text-xs flex items-center gap-2 flex-wrap">
                            <span
                              className="inline-flex items-center justify-center px-1.5 rounded text-white font-bold text-[10px] min-w-[24px]"
                              style={{ backgroundColor: p.site_color ?? "#666" }}
                            >
                              {p.site_code}
                            </span>
                            <span className="font-bold truncate flex-1 min-w-[80px]">{p.site_name}</span>
                            <span className="text-ink-3">{totalShifts} shifts · {hours.toFixed(0)}h</span>
                            {totalUncovered === 0 ? (
                              <Check className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <span className="inline-flex items-center gap-1 text-warn">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span className="text-[10px]">{totalUncovered} non couvert{totalUncovered > 1 ? "s" : ""}</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        <DialogFooter>
          {phase === "select" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Annuler
              </Button>
              <Button variant="gold" onClick={onPreview} disabled={pending || selected.size === 0}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Générer la preview ({selected.size})
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={backToSelect} disabled={pending}>
                ← Revenir aux sites
              </Button>
              <Button variant="gold" onClick={onApply} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Tout valider
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
