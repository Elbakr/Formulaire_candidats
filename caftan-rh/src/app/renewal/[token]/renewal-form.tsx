"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2, PartyPopper } from "lucide-react";
import { submitRenewalResponseAction } from "./actions";

export function RenewalForm({ token, firstName }: { token: string; firstName: string }) {
  const [wants, setWants] = useState<boolean | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [appr, setAppr] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (wants === null) {
      setErr("Choisis d'abord Oui ou Non.");
      return;
    }
    start(async () => {
      const r = await submitRenewalResponseAction({
        token,
        wantsRenewal: wants,
        availableFrom: from || null,
        availableTo: to || null,
        reason,
        appreciation: appr,
      });
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex h-14 w-14 rounded-full bg-success-light text-success items-center justify-center mb-3">
          <PartyPopper className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-ink">Merci {firstName} !</h2>
        <p className="text-sm text-ink-2 mt-1">
          Ta réponse a bien été transmise à l'équipe RH. Nous revenons vers toi très vite.
        </p>
      </div>
    );
  }

  const btn = (active: boolean, color: "success" | "danger") =>
    `flex-1 flex items-center justify-center gap-2 rounded-xl py-3 min-h-[52px] text-sm font-bold border-2 transition-all active:scale-[0.98] ${
      active
        ? color === "success"
          ? "border-success bg-success-light text-success"
          : "border-danger bg-danger-light text-danger"
        : "border-line bg-surface text-ink-2"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-ink mb-2">
          Souhaites-tu être renouvelé·e ?
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setWants(true)} className={btn(wants === true, "success")}>
            <Check className="h-5 w-5" /> Oui, avec plaisir
          </button>
          <button type="button" onClick={() => setWants(false)} className={btn(wants === false, "danger")}>
            <X className="h-5 w-5" /> Non
          </button>
        </div>
      </div>

      {wants === true ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Disponible à partir du</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Jusqu'au (si connu)</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
            />
          </div>
        </div>
      ) : null}

      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">
          Ta raison (optionnel)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Ce que tu souhaites nous dire sur ce choix…"
          className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">
          Ton appréciation du poste et de l'équipe (optionnel)
        </label>
        <textarea
          value={appr}
          onChange={(e) => setAppr(e.target.value)}
          rows={3}
          placeholder="Ton ressenti, ce qui t'a plu, ce qui pourrait être amélioré…"
          className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
        />
      </div>

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Envoyer ma réponse
      </button>
    </div>
  );
}
