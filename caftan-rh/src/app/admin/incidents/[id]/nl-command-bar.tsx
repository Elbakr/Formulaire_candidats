"use client";

// Barre de commande langage naturel (incrément 2b). L'admin écrit une instruction
// en clair ; Claude la traduit en action ; le sûr s'exécute, le sensible se confirme.

import { useState, useTransition } from "react";
import { Send, Sparkles } from "lucide-react";
import { nlCommandAction, confirmNlAction, type NlResult } from "./qcm-actions";

export function NlCommandBar({ incidentId }: { incidentId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<NlResult | null>(null);

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    start(async () => {
      const r = await nlCommandAction(t, incidentId);
      setResult(r);
      if (r.mode === "executed" && r.ok) setText("");
    });
  }

  function confirm() {
    if (!result?.proposal || pending) return;
    const p = result.proposal;
    start(async () => {
      const r = await confirmNlAction(p.action, JSON.stringify(p.params), incidentId);
      setResult({ ok: r.ok, mode: "executed", message: r.message ?? r.error ?? "Fait." });
      setText("");
    });
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-gold-dark" /> Dis-moi quoi faire (langage naturel)
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          disabled={pending}
          placeholder="ex : relance le poll Tuya · mets failed_mails en sourdine · ferme les pointages ouverts"
          className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={pending || !text.trim()}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-sm font-bold text-white hover:bg-gold-dark disabled:opacity-50"
        >
          {pending ? "…" : <Send className="h-4 w-4" />}
        </button>
      </div>

      {result ? (
        <div className={`text-sm rounded-md p-2.5 ${result.ok ? "bg-success-light/30" : "bg-warn-light/30"} text-ink`}>
          {result.message}
          {result.mode === "confirm" && result.proposal ? (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={confirm}
                disabled={pending}
                className="text-xs font-bold px-3 py-1.5 rounded-md border border-danger text-danger hover:bg-danger-light/30 disabled:opacity-50"
              >
                Confirmer cette action sensible
              </button>
              <button onClick={() => setResult(null)} className="text-xs text-ink-3 hover:text-ink">
                Annuler
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-[10px] text-ink-3">
        Claude interprète ta phrase → action d'un catalogue fermé. Les actions sûres s'exécutent directement,
        les sensibles demandent confirmation. Jamais de terminal.
      </div>
    </div>
  );
}
