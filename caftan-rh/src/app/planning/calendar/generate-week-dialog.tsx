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

const PREF_KEY = "gen_week_sites_pref";

type PreviewRow = {
  site_id: string;
  site_code: string;
  site_name: string;
  site_color: string | null;
  preview?: SitePlanPreview;
  error?: string;
};

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
  const [previews, setPreviews] = useState<PreviewRow[] | null>(null);
  const [phase, setPhase] = useState<"select" | "preview">("select");

  // Charge la pref localStorage a l'ouverture
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        const valid = ids.filter((id) => sites.some((s) => s.id === id));
        if (valid.length > 0) {
          setSelected(new Set(valid));
          return;
        }
      }
    } catch {
      /* noop */
    }
    // Defaut : tous les sites actifs coches
    setSelected(new Set(sites.map((s) => s.id)));
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
    // Persiste la pref
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      /* noop */
    }
    startTransition(async () => {
      const r = await previewMultiSitePlanAction(codes, mondayISO);
      const rows: PreviewRow[] = r.items.map((it) => {
        const site = sites.find((s) => s.code === it.site_code)!;
        return {
          site_id: site.id,
          site_code: site.code,
          site_name: site.name,
          site_color: site.color,
          preview: it.preview,
          error: it.error,
        };
      });
      setPreviews(rows);
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
        week_monday: mondayISO,
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
        toast.error(`${ok}/${r.results.length} sites OK. Échecs : ${failed.map((f) => f.site_code).join(", ")}`);
      } else {
        toast.success(`${ok} sites validés · ${totalCreated} shifts créés. Bouton ⮌ visible pour annuler.`);
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
            Générer le planning de la semaine
          </DialogTitle>
          <DialogDescription>
            Semaine du {new Date(mondayISO + "T00:00:00").toLocaleDateString("fr-BE", { day: "2-digit", month: "long" })}
            {phase === "select"
              ? " · choisis les sites à inclure"
              : " · vérifie puis valide"}
          </DialogDescription>
        </DialogHeader>

        {phase === "select" ? (
          <div className="space-y-2 max-h-96 overflow-auto">
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
            <p className="text-[11px] text-ink-3 italic mt-2">
              Tes choix sont mémorisés pour la prochaine fois.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {previews?.map((p) => {
              if (p.error) {
                return (
                  <div key={p.site_code} className="rounded border border-danger/40 bg-danger-light/30 p-3 text-xs">
                    <div className="font-bold text-danger flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {p.site_code} · {p.site_name}
                    </div>
                    <div className="text-ink-2 mt-1">{p.error}</div>
                  </div>
                );
              }
              if (!p.preview) return null;
              const totalShifts = p.preview.drafts.length;
              const totalUncovered = p.preview.uncovered.reduce((a, u) => a + u.missing, 0);
              return (
                <div key={p.site_code} className="rounded border border-line p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center justify-center px-1.5 rounded text-white font-bold text-[10px] min-w-[24px]"
                      style={{ backgroundColor: p.site_color ?? "#666" }}
                    >
                      {p.site_code}
                    </span>
                    <span className="font-bold">{p.site_name}</span>
                    {totalUncovered === 0 ? (
                      <Check className="h-3.5 w-3.5 text-success ml-auto" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-warn ml-auto" />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-ink-2">
                    <div>
                      <div className="text-[10px] uppercase text-ink-3">Shifts proposés</div>
                      <div className="font-mono font-bold">{totalShifts}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-ink-3">Non couverts</div>
                      <div className={`font-mono font-bold ${totalUncovered > 0 ? "text-warn" : "text-success"}`}>
                        {totalUncovered}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-ink-3">Heures totales</div>
                      <div className="font-mono font-bold">
                        {p.preview.drafts
                          .reduce((a, d) => {
                            const [sh, sm] = d.start_time.split(":").map(Number);
                            const [eh, em] = d.end_time.split(":").map(Number);
                            return a + (eh * 60 + em - sh * 60 - sm - (d.break_minutes ?? 0)) / 60;
                          }, 0)
                          .toFixed(0)}
                        h
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
