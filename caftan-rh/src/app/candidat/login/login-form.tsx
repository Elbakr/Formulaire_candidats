"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Mail, CheckCircle2, Sparkles } from "lucide-react";
import { requestCandidateLoginAction } from "./actions";
import { isoMinusYears } from "@/lib/be-validators";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";

export function CandidateLoginForm({ next }: { next: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const maxBirthDate = useMemo(() => isoMinusYears(17), []);
  const [birthDate, setBirthDate] = useState<string>(() => isoMinusYears(17));
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [cityAuto, setCityAuto] = useState(false);
  const cityEditedRef = useRef(false);

  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Code postal -> ville auto (table locale instantanée + API).
  useEffect(() => {
    const code = postalCode.trim();
    if (!isBePostalCode(code) || cityEditedRef.current) return;
    const local = localBeCity(code);
    if (local) { setCity(local); setCityAuto(true); return; }
    let cancelled = false;
    const tmo = setTimeout(async () => {
      const c = await lookupBeCity(code);
      if (!cancelled && c && !cityEditedRef.current) { setCity(c); setCityAuto(true); }
    }, 300);
    return () => { cancelled = true; clearTimeout(tmo); };
  }, [postalCode]);

  function submit() {
    setErr(null);
    if (fullName.trim().length < 2) { setErr("Indique ton prénom et nom."); return; }
    if (!/.+@.+\..+/.test(email.trim())) { setErr("Entre une adresse email valide."); return; }
    if (!birthDate) { setErr("Indique ta date de naissance."); return; }
    if (new Date(birthDate) > new Date(maxBirthDate)) { setErr("Tu dois avoir au moins 17 ans."); return; }
    if (!isBePostalCode(postalCode.trim())) { setErr("Indique un code postal belge (4 chiffres)."); return; }

    const fd = new FormData();
    fd.set("full_name", fullName.trim());
    fd.set("email", email.trim());
    fd.set("birth_date", birthDate);
    fd.set("postal_code", postalCode.trim());
    fd.set("city", city.trim());
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
        <button type="button" onClick={() => setSent(false)} className="mt-4 text-xs font-semibold text-gold-dark hover:underline">
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">Prénom et nom *</label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex. Sophia El Amrani" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">Email *</label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <input
            type="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@email.com"
            className={`${inputCls} pl-8`}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-ink-2 mb-1">Date de naissance *</label>
          <input type="date" value={birthDate} max={maxBirthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-2 mb-1">Code postal *</label>
          <input
            type="text" inputMode="numeric" maxLength={4} value={postalCode}
            onChange={(e) => { setPostalCode(e.target.value.replace(/\D/g, "")); cityEditedRef.current = false; setCityAuto(false); }}
            placeholder="1000" className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1">
          Ville / commune
          {cityAuto ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-success"><Sparkles className="h-3 w-3" /> auto</span> : null}
        </label>
        <input
          type="text" value={city}
          onChange={(e) => { setCity(e.target.value); cityEditedRef.current = true; setCityAuto(false); }}
          placeholder="Bruxelles" className={inputCls}
        />
      </div>

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button" onClick={submit} disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Recevoir mon lien de connexion
      </button>
      <p className="text-[11px] text-ink-3 text-center">Sans mot de passe. On t'envoie un lien sécurisé par email.</p>
    </div>
  );
}
