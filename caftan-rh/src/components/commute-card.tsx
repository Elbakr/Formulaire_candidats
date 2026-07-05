"use client";

// Karim 2026-07-03 : affiche le trajet domicile -> 2 sièges (km route + temps
// voiture + temps transports en commun). Lit le CACHE ; le calcul Google Routes
// n'est déclenché QUE sur clic (jamais au rendu).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bus, Car, MapPin, RefreshCw } from "lucide-react";
import { HEADQUARTERS, type CommuteResult } from "@/lib/commute-shared";
import { computeCommuteAction } from "@/lib/commute-actions";

export function CommuteCard({
  subjectType,
  subjectId,
  commute,
  computedAt,
}: {
  subjectType: "candidate" | "employee";
  subjectId: string;
  commute: CommuteResult | null;
  computedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      const r = await computeCommuteAction(subjectType, subjectId);
      if (r.ok) router.refresh();
      else setErr(r.error ?? "Erreur");
    });
  }

  const fmtMin = (m: number | null) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`);

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="bg-surface-2 px-3 py-2 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gold-dark" />
        <div className="text-[13px] font-bold text-ink flex-1">Trajet domicile → sièges</div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-ink text-white text-[11px] font-bold disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {commute ? "Recalculer" : "Calculer"}
        </button>
      </div>

      {err ? <div className="px-3 py-2 text-xs text-danger">{err}</div> : null}

      {commute ? (
        <div className="divide-y divide-line">
          {HEADQUARTERS.map((hq) => {
            const leg = commute.byKey?.[hq.key];
            return (
              <div key={hq.key} className="px-3 py-2">
                <div className="text-[12px] font-semibold text-ink">{hq.label}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-[13px]">
                  <span className="inline-flex items-center gap-1">
                    <Car className="h-3.5 w-3.5 text-ink-3" />
                    {leg?.drive_km != null ? `${leg.drive_km} km` : "—"} · {fmtMin(leg?.drive_min ?? null)}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-gold-dark">
                    <Bus className="h-3.5 w-3.5" />
                    {fmtMin(leg?.transit_min ?? null)} en transports
                  </span>
                </div>
              </div>
            );
          })}
          <div className="px-3 py-1.5 text-[10px] text-ink-3">
            Estimation Google · calculé le {computedAt ? new Date(computedAt).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" }) : "—"}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-ink-3">
          Pas encore calculé. Clique « Calculer » (distance routière + temps en transports en commun vers les 2 sièges).
        </div>
      )}
    </div>
  );
}
