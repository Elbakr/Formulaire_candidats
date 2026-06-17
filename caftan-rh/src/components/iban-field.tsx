"use client";

// Karim 2026-06-17 : champ IBAN unifié, réutilisable PARTOUT.
//  - Pays par liste déroulante, défaut « Belgique (BE) » (préfixe pré-rempli).
//  - Saisie restreinte aux chiffres pour BE (clavier numérique mobile) ; NL/FR
//    autorisent les lettres (leurs IBAN en contiennent).
//  - Validation MOD-97 (ISO 13616) en direct (✓ / ✗).
//  - Émet l'IBAN complet (sans espaces) via onChange ET via un <input hidden>
//    nommé (compatible formulaires FormData). Auto-géré (état interne) : marche
//    aussi bien en contrôlé (onChange) qu'en non contrôlé (defaultValue).

import { useState } from "react";
import { Check, X } from "lucide-react";

type Country = { code: string; total: number; digitsOnly: boolean; label: string };
const COUNTRIES: Country[] = [
  { code: "BE", total: 16, digitsOnly: true, label: "Belgique (BE)" },
  { code: "NL", total: 18, digitsOnly: false, label: "Pays-Bas (NL)" },
  { code: "FR", total: 27, digitsOnly: false, label: "France (FR)" },
];

function cfgOf(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

function mod97Ok(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{6,30}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

function group(s: string): string {
  return s.replace(/(.{4})/g, "$1 ").trim();
}

/** Sépare un IBAN en (pays, reste) ; pays par défaut BE. */
function parse(value: string): { country: string; rest: string } {
  const norm = (value || "").replace(/\s+/g, "").toUpperCase();
  const found = COUNTRIES.find((c) => norm.startsWith(c.code));
  if (found) return { country: found.code, rest: norm.slice(2) };
  // pas de préfixe pays reconnu : on retire d'éventuelles lettres de tête.
  return { country: "BE", rest: norm.replace(/^[A-Z]+/, "") };
}

export function IbanField({
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  id,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (fullIban: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
}) {
  const seed = parse(value ?? defaultValue ?? "");
  const [country, setCountry] = useState(seed.country);
  const [rest, setRest] = useState(seed.rest);

  const cfg = cfgOf(country);
  const full = rest ? country + rest : "";
  const status: "empty" | "ok" | "bad" = rest === "" ? "empty" : mod97Ok(full) ? "ok" : "bad";

  function emit(c: string, r: string) {
    onChange?.(r ? c + r : "");
  }
  function changeCountry(c: string) {
    // tronque le reste si le nouveau pays a une longueur max plus courte.
    const max = cfgOf(c).total - 2;
    const r = rest.slice(0, max);
    setCountry(c);
    setRest(r);
    emit(c, r);
  }
  function changeRest(raw: string) {
    let cleaned = raw.replace(/\s+/g, "").toUpperCase();
    cleaned = cfg.digitsOnly ? cleaned.replace(/[^0-9]/g, "") : cleaned.replace(/[^0-9A-Z]/g, "");
    cleaned = cleaned.slice(0, cfg.total - 2);
    setRest(cleaned);
    emit(country, cleaned);
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={country}
          onChange={(e) => changeCountry(e.target.value)}
          aria-label="Pays du compte bancaire"
          className="rounded-lg border-[1.5px] border-line bg-surface px-2 py-2 text-sm outline-none focus:border-gold"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label.replace(/\s*\(.*\)$/, "")}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            inputMode={cfg.digitsOnly ? "numeric" : "text"}
            value={group(rest)}
            onChange={(e) => changeRest(e.target.value)}
            onBlur={onBlur}
            placeholder={cfg.digitsOnly ? "0000 0000 0000 00" : "compte bancaire"}
            className={[
              "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
              status === "ok" ? "border-success pr-9" : status === "bad" ? "border-danger pr-9" : "border-line focus:border-gold",
            ].join(" ")}
          />
          {status !== "empty" ? (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {status === "ok" ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-danger" />}
            </span>
          ) : null}
        </div>
      </div>
      {name ? <input type="hidden" name={name} value={full} /> : null}
      {status === "bad" ? <p className="mt-1 text-[11px] text-danger">IBAN invalide — vérifie les chiffres.</p> : null}
      {status === "ok" ? <p className="mt-1 text-[11px] text-success">IBAN valide ✓</p> : null}
    </div>
  );
}
