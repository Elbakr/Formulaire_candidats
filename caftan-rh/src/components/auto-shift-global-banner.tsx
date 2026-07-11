"use client";

// Karim 2026-07-11 : BANDEAU global Auto-Shift, ULTRA-ACCESSIBLE (rendu dans le
// layout racine, sticky en haut). Visible UNIQUEMENT pour admin/rh et seulement
// quand le mode global est PROGRAMMÉ (préavis 10 min) ou ACTIF. Offre l'annulation
// en 1 clic partout dans l'app. Masqué (rien) pour tout le monde sinon.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Radio, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAutoShiftBannerAction,
  cancelGlobalAutoShiftAction,
} from "@/app/admin/auto-shift-actions";

type State = "off" | "pending" | "active";

export function AutoShiftGlobalBanner() {
  const [state, setState] = useState<State>("off");
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [remaining, setRemaining] = useState<number>(0); // ms avant bascule (pending)
  const [cancelling, startCancel] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const r = await getAutoShiftBannerAction();
      setCanManage(r.canManage);
      setState(r.state);
      setEffectiveAt(r.effective_at);
    } catch {
      /* silencieux */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Compte à rebours (pending) : tick chaque seconde, bascule à l'échéance.
  useEffect(() => {
    if (state !== "pending" || !effectiveAt) return;
    const tick = () => {
      const ms = new Date(effectiveAt).getTime() - Date.now();
      setRemaining(ms);
      if (ms <= 0) refresh(); // échéance atteinte -> passe en 'active'
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, effectiveAt, refresh]);

  function cancel() {
    startCancel(async () => {
      const r = await cancelGlobalAutoShiftAction();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Auto-Shift global annulé.");
      setState("off");
      await refresh();
    });
  }

  if (!canManage || state === "off") return null;

  const mmss = (() => {
    const s = Math.max(0, Math.floor(remaining / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  })();

  const pending = state === "pending";
  return (
    <div
      className={`sticky top-0 z-[60] w-full px-4 py-2 text-white flex items-center gap-3 ${
        pending ? "bg-amber-600" : "bg-emerald-700"
      }`}
    >
      <Radio className="h-4 w-4 shrink-0" />
      <div className="min-w-0 text-sm font-semibold leading-tight">
        {pending ? (
          <>
            Auto-Shift GLOBAL dans <span className="font-mono font-bold">{mmss}</span> — toutes les
            tablettes passeront au planning réel du jour.
          </>
        ) : (
          <>Auto-Shift GLOBAL actif — toutes les tablettes affichent le planning réel du jour.</>
        )}
      </div>
      <button
        type="button"
        onClick={cancel}
        disabled={cancelling}
        className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60"
      >
        {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        {pending ? "Annuler" : "Désactiver"}
      </button>
    </div>
  );
}
