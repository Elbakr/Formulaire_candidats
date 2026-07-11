"use client";

// Karim 2026-07-11 : réglage de l'Auto-Shift GLOBAL (tous les travailleurs).
// Active avec un PRÉAVIS de 10 min (notif admin + fenêtre d'annulation), ou
// annule/désactive. Le bandeau global (layout) permet aussi d'annuler partout.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  scheduleGlobalAutoShiftAction,
  cancelGlobalAutoShiftAction,
} from "@/app/admin/auto-shift-actions";

export function AutoShiftGlobalForm({ initialEffectiveAt }: { initialEffectiveAt: string | null }) {
  const router = useRouter();
  const [effectiveAt, setEffectiveAt] = useState<string | null>(initialEffectiveAt);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const effMs = effectiveAt ? new Date(effectiveAt).getTime() : null;
  const state: "off" | "pending" | "active" =
    effMs == null ? "off" : now >= effMs ? "active" : "pending";
  const remainMs = effMs != null ? Math.max(0, effMs - now) : 0;
  const mmss = `${String(Math.floor(remainMs / 60000)).padStart(2, "0")}:${String(
    Math.floor((remainMs % 60000) / 1000),
  ).padStart(2, "0")}`;

  function activate() {
    start(async () => {
      const r = await scheduleGlobalAutoShiftAction();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setEffectiveAt(new Date(Date.now() + 10 * 60_000).toISOString());
      toast.success("Auto-Shift global programmé dans 10 min. Notif admin envoyée.");
      router.refresh();
    });
  }
  function cancel() {
    start(async () => {
      const r = await cancelGlobalAutoShiftAction();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setEffectiveAt(null);
      toast.success("Auto-Shift global désactivé.");
      router.refresh();
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-gold-dark" />
        <h2 className="font-bold text-sm">Auto-Shift global</h2>
        {state === "pending" ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
            Programmé · {mmss}
          </span>
        ) : state === "active" ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-bold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" /> Actif
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-ink-3">Désactivé</span>
        )}
      </div>

      <p className="text-xs text-ink-2 leading-snug">
        Bascule <strong>TOUTES les tablettes</strong> sur le planning réel du jour (au lieu du variant
        coché par travailleur). L&apos;activation est <strong>programmée à +10 min</strong> avec une notif
        admin : tu peux annuler avant la bascule, ici, depuis la notif, ou via le bandeau en haut de
        l&apos;app.
      </p>

      {state === "off" ? (
        <button
          type="button"
          onClick={activate}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-gold text-white hover:bg-gold-dark px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Activer Auto-Shift global (+10 min)
        </button>
      ) : (
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-ink text-white hover:bg-ink/90 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          {state === "pending" ? "Annuler la bascule" : "Désactiver l'Auto-Shift global"}
        </button>
      )}
    </div>
  );
}
