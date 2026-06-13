"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, CheckCircle2, Check, X, Sparkles } from "lucide-react";
import { submitContractInfoAction } from "./actions";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";

type Field = { key: string; label: string };

// Ordre logique : la date de naissance avant le NISS (qu'elle pre-remplit),
// le code postal avant la ville (qu'il auto-detecte).
const FIELD_ORDER = ["full_name", "email", "birth_date", "nrn", "address", "postal_code", "city", "iban"];

function inputType(key: string): string {
  if (key === "birth_date") return "date";
  if (key === "email") return "email";
  if (key === "postal_code") return "text";
  return "text";
}
function placeholder(key: string): string {
  switch (key) {
    case "iban": return "BE.. .... .... ....";
    case "nrn": return "AA.MM.JJ-XXX.CC";
    case "postal_code": return "1000";
    case "city": return "Bruxelles";
    case "address": return "Rue, numéro";
    default: return "";
  }
}

// --- IBAN : validation instantanee (mod-97, ISO 13616) ---------------------
function normalizeIban(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}
function ibanIsValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("BE") && iban.length !== 16) return false; // BE = 16 car.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}
function formatIbanGroups(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

// --- NISS : prefixe = date de naissance inversee (AAMMJJ) -------------------
function birthDateToNissPrefix(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[1].slice(2)}${m[2]}${m[3]}`; // AAMMJJ
}

export function ContractInfoForm({
  token,
  fields,
  firstName,
  birthDate,
}: {
  token: string;
  fields: Field[];
  firstName: string;
  birthDate?: string | null;
}) {
  const ordered = useMemo(
    () => [...fields].sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key)),
    [fields],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cityAuto, setCityAuto] = useState(false); // ville remplie automatiquement
  const editedRef = useRef<Set<string>>(new Set()); // champs modifies a la main

  const hasCity = ordered.some((f) => f.key === "city");
  const hasNrn = ordered.some((f) => f.key === "nrn");

  // Date de naissance effective : saisie dans le form, sinon deja connue.
  const effectiveBirth = values.birth_date || birthDate || "";

  // 1) NISS : pre-remplit le prefixe AAMMJJ des que la date de naissance est
  //    connue, tant que l'utilisateur n'a pas edite le champ a la main.
  useEffect(() => {
    if (!hasNrn) return;
    if (editedRef.current.has("nrn")) return;
    const prefix = birthDateToNissPrefix(effectiveBirth);
    if (!prefix) return;
    setValues((v) => {
      const cur = v.nrn ?? "";
      // ne reecrit que si vide ou si c'etait un prefixe auto precedent
      if (cur === "" || cur.length <= 6) return { ...v, nrn: prefix };
      return v;
    });
  }, [effectiveBirth, hasNrn]);

  // 2) Code postal -> ville : auto-detection (table locale instantanee + API).
  useEffect(() => {
    if (!hasCity) return;
    const code = (values.postal_code ?? "").trim();
    if (!isBePostalCode(code)) return;
    if (editedRef.current.has("city")) return; // l'utilisateur a tape sa ville
    // instantane si connu localement
    const local = localBeCity(code);
    if (local) {
      setValues((v) => ({ ...v, city: local }));
      setCityAuto(true);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const city = await lookupBeCity(code);
      if (cancelled || !city) return;
      if (editedRef.current.has("city")) return;
      setValues((v) => ({ ...v, city }));
      setCityAuto(true);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [values.postal_code, hasCity]);

  function setField(key: string, val: string, manual = true) {
    if (manual) editedRef.current.add(key);
    if (key === "city" && manual) setCityAuto(false);
    setValues((v) => ({ ...v, [key]: val }));
  }

  const ibanRaw = values.iban ?? "";
  const ibanStatus: "empty" | "ok" | "bad" =
    ibanRaw.trim() === "" ? "empty" : ibanIsValid(ibanRaw) ? "ok" : "bad";

  function submit() {
    setErr(null);
    const filled = ordered.filter((f) => (values[f.key] ?? "").trim());
    if (filled.length === 0) {
      setErr("Renseigne au moins une information.");
      return;
    }
    if (ibanStatus === "bad") {
      setErr("L'IBAN saisi n'est pas valide. Vérifie-le avant d'enregistrer.");
      return;
    }
    // normalise l'IBAN avant envoi
    const payload = { ...values };
    if (payload.iban) payload.iban = normalizeIban(payload.iban);
    start(async () => {
      const r = await submitContractInfoAction(token, payload);
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex h-14 w-14 rounded-full bg-success-light text-success items-center justify-center mb-3">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-ink">Merci {firstName} !</h2>
        <p className="text-sm text-ink-2 mt-1">
          Tes informations sont enregistrées. Ton dossier avance — l'équipe RH revient vers toi pour la suite.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ordered.map((f) => {
        const isIban = f.key === "iban";
        const isCity = f.key === "city";
        return (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-ink-2 mb-1">
              {f.label}
              {isCity && cityAuto ? (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-success">
                  <Sparkles className="h-3 w-3" /> auto
                </span>
              ) : null}
            </label>

            <div className="relative">
              <input
                type={inputType(f.key)}
                inputMode={f.key === "postal_code" ? "numeric" : undefined}
                value={values[f.key] ?? ""}
                placeholder={placeholder(f.key)}
                onChange={(e) => setField(f.key, e.target.value)}
                onBlur={isIban ? () => {
                  // re-formate joliment l'IBAN au blur si valide
                  if (ibanStatus === "ok") setValues((v) => ({ ...v, iban: formatIbanGroups(v.iban ?? "") }));
                } : undefined}
                className={[
                  "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                  isIban && ibanStatus === "ok" ? "border-success pr-9" :
                  isIban && ibanStatus === "bad" ? "border-danger pr-9" :
                  "border-line focus:border-gold",
                ].join(" ")}
              />
              {isIban && ibanStatus !== "empty" ? (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {ibanStatus === "ok"
                    ? <Check className="h-4 w-4 text-success" />
                    : <X className="h-4 w-4 text-danger" />}
                </span>
              ) : null}
            </div>

            {isIban && ibanStatus === "bad" ? (
              <p className="text-[11px] text-danger mt-1">IBAN invalide — vérifie les chiffres.</p>
            ) : null}
            {isIban && ibanStatus === "ok" ? (
              <p className="text-[11px] text-success mt-1">IBAN valide ✓</p>
            ) : null}
            {f.key === "nrn" ? (
              <p className="text-[11px] text-ink-3 mt-1">
                Pré-rempli avec ta date de naissance (AAMMJJ) — complète les chiffres restants.
              </p>
            ) : null}
          </div>
        );
      })}

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Enregistrer mes informations
      </button>
    </div>
  );
}
