"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { requestAccountErasure } from "./erasure-actions";

export function ErasureButton() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="text-[11px] text-success inline-flex items-center gap-1 justify-center w-full">
        <CheckCircle2 className="h-3.5 w-3.5" /> Demande envoyée. L'équipe RH la traitera sous 30 jours.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-ink-3 hover:text-danger underline">
        Supprimer mon compte et mes données (RGPD)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-danger/40 bg-danger-light/30 p-3 text-center">
      <p className="text-xs text-ink-2 mb-2">
        Tu demandes la suppression de ton compte et de tes données. L'équipe RH la traitera
        (certaines pièces légales de paie sont conservées le délai légal).
      </p>
      <div className="flex gap-2 justify-center">
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold px-3 py-1.5 rounded-md border border-line">
          Annuler
        </button>
        <button
          type="button" disabled={pending}
          onClick={() => start(async () => { const r = await requestAccountErasure(); if (r.ok) setDone(true); })}
          className="text-xs font-bold px-3 py-1.5 rounded-md bg-danger text-white inline-flex items-center gap-1 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirmer la demande
        </button>
      </div>
    </div>
  );
}
