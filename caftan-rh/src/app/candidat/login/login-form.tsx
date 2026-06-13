"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { requestCandidateLoginAction } from "./actions";

export function CandidateLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (fullName.trim().length < 2) {
      setErr("Indique ton prénom et nom.");
      return;
    }
    if (!/.+@.+\..+/.test(email.trim())) {
      setErr("Entre une adresse email valide.");
      return;
    }
    const fd = new FormData();
    fd.set("email", email.trim());
    fd.set("full_name", fullName.trim());
    fd.set("next", next);
    start(async () => {
      const r = await requestCandidateLoginAction(fd);
      if (r.ok) setSent(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex h-14 w-14 rounded-full bg-success-light text-success items-center justify-center mb-3">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-ink">Vérifie tes emails</h2>
        <p className="text-sm text-ink-2 mt-1">
          On vient d'envoyer un lien de connexion à <b className="text-ink">{email.trim()}</b>.
          Clique dessus pour accéder à ton espace (le lien expire dans 1 heure).
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); }}
          className="mt-4 text-xs font-semibold text-gold-dark hover:underline"
        >
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">Ton prénom et nom</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ex. Sophia El Amrani"
          className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">Ton email</label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="prenom@email.com"
            enterKeyHint="send"
            className="w-full rounded-lg border-[1.5px] border-line bg-surface pl-8 pr-3 py-2 text-sm focus:border-gold outline-none"
          />
        </div>
      </div>

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Recevoir mon lien de connexion
      </button>
      <p className="text-[11px] text-ink-3 text-center">
        Sans mot de passe. On t'envoie un lien sécurisé par email.
      </p>
    </div>
  );
}
