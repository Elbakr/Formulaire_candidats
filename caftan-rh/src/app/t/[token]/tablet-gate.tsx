"use client";

// Karim 2026-07-12 : écrans de VERROUILLAGE APPAREIL de la tablette.
//  - TabletEnroll : 1re ouverture -> bouton « Activer cette tablette sur cet appareil ».
//  - TabletDenied : lien ouvert depuis un AUTRE appareil que celui enrôlé -> refus.

import { useState, useTransition } from "react";
import { Tablet, ShieldCheck, Lock, Loader2 } from "lucide-react";
import { enrollTabletDeviceAction } from "./enroll-actions";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-ink p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">{children}</div>
    </div>
  );
}

export function TabletEnroll({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function activate() {
    setErr(null);
    start(async () => {
      const r = await enrollTabletDeviceAction(token);
      if (r.ok) {
        window.location.reload();
      } else {
        setErr(r.error ?? "Activation impossible.");
      }
    });
  }

  return (
    <Shell>
      <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-gold-light flex items-center justify-center text-gold-dark">
        <Tablet className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-bold text-ink">Activer cette tablette</h1>
      <p className="mt-1.5 text-sm text-ink-2 leading-snug">
        Ce lien n&apos;est pas encore associé à un appareil. Active-le{" "}
        <strong>sur CETTE tablette uniquement</strong> : ensuite, le lien sera refusé sur tout autre
        appareil.
      </p>
      <button
        type="button"
        onClick={activate}
        disabled={pending}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-canvas font-bold py-3 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
        Activer sur cet appareil
      </button>
      {err ? <p className="mt-2 text-[12px] text-danger font-semibold">{err}</p> : null}
      <p className="mt-3 text-[11px] text-ink-3">
        À faire une seule fois, sur la tablette du magasin.
      </p>
    </Shell>
  );
}

export function TabletDenied() {
  return (
    <Shell>
      <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-danger-light flex items-center justify-center text-danger">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-bold text-ink">Appareil non autorisé</h1>
      <p className="mt-1.5 text-sm text-ink-2 leading-snug">
        Cette tablette a déjà été <strong>enrôlée sur un autre appareil</strong>. Pour des raisons de
        sécurité, ce lien ne fonctionne que sur l&apos;appareil d&apos;origine.
      </p>
      <p className="mt-3 text-[12px] text-ink-3">
        Tablette perdue ou remplacée ? Demande à l&apos;admin de <strong>réinitialiser l&apos;appareil</strong>{" "}
        dans les réglages, puis ré-active depuis la nouvelle tablette.
      </p>
    </Shell>
  );
}
