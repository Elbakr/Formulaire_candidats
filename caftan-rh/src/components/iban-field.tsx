"use client";

// Karim 2026-06-18 : champ IBAN unifié, réutilisable PARTOUT.
//  - Pays par liste déroulante (BE, NL, FR d'abord, puis pays européens), défaut
//    Belgique. La case (trigger) affiche le CODE court (« BE ») ; la liste ouverte
//    montre le nom complet (« Belgique »).
//  - Affichage IBAN NORMAL groupé par 4 « BE.. .... .... .... » (formatIBAN existant).
//  - Saisie restreinte aux chiffres pour BE (clavier numérique mobile).
//  - Validation : MOD-97 via la logique EXISTANTE (validateBelgianIBAN pour BE,
//    ibanChecksumOk pour les autres). Aucune logique réinventée.
//  - Émet l'IBAN complet (sans espaces) via onChange ET via un <input hidden> nommé
//    (compatible FormData). Contrôlé (onChange) ou non (defaultValue).

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { formatIBAN, validateBelgianIBAN, ibanChecksumOk } from "@/lib/be-validators";

type Country = { code: string; len: number; label: string };
// Ordre actuel conservé : BE, NL, FR — puis autres pays européens.
const COUNTRIES: Country[] = [
  { code: "BE", len: 16, label: "Belgique" },
  { code: "NL", len: 18, label: "Pays-Bas" },
  { code: "FR", len: 27, label: "France" },
  { code: "LU", len: 20, label: "Luxembourg" },
  { code: "DE", len: 22, label: "Allemagne" },
  { code: "ES", len: 24, label: "Espagne" },
  { code: "IT", len: 27, label: "Italie" },
  { code: "PT", len: 25, label: "Portugal" },
  { code: "AT", len: 20, label: "Autriche" },
  { code: "IE", len: 22, label: "Irlande" },
  { code: "FI", len: 18, label: "Finlande" },
  { code: "GR", len: 27, label: "Grèce" },
  { code: "PL", len: 28, label: "Pologne" },
  { code: "CH", len: 21, label: "Suisse" },
  { code: "GB", len: 22, label: "Royaume-Uni" },
];

function cfgOf(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}
function clean(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
/** Sépare un IBAN en (pays, reste). Pays par défaut BE. */
function parse(value: string): { country: string; rest: string } {
  const s = clean(value);
  const found = COUNTRIES.find((c) => s.startsWith(c.code));
  if (found) return { country: found.code, rest: s.slice(2) };
  return { country: "BE", rest: s.replace(/^[A-Z]+/, "") };
}
function isValidFull(full: string): boolean {
  const s = clean(full);
  if (s.startsWith("BE")) return validateBelgianIBAN(s).valid;
  const cc = COUNTRIES.find((c) => s.startsWith(c.code));
  if (!cc) return false;
  return s.length === cc.len && ibanChecksumOk(s);
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
  const status: "empty" | "ok" | "bad" = rest === "" ? "empty" : isValidFull(full) ? "ok" : "bad";

  function emit(c: string, r: string) {
    onChange?.(r ? c + r : "");
  }
  function changeCountry(c: string) {
    const r = rest.slice(0, cfgOf(c).len - 2);
    setCountry(c);
    setRest(r);
    emit(c, r);
  }
  function onInput(raw: string) {
    let s = clean(raw);
    // Si l'utilisateur (re)tape un préfixe pays connu, on le reconnaît ; sinon il
    // tape juste le reste après le pays courant.
    const known = COUNTRIES.find((c) => s.startsWith(c.code));
    let cc = country;
    if (known) {
      cc = known.code;
      s = s.slice(2);
    }
    const cc_cfg = cfgOf(cc);
    if (cc === "BE") s = s.replace(/[^0-9]/g, ""); // BE : chiffres uniquement
    s = s.slice(0, cc_cfg.len - 2);
    setCountry(cc);
    setRest(s);
    emit(cc, s);
  }

  return (
    <div>
      <div className="flex gap-2">
        <Select value={country} onValueChange={changeCountry}>
          <SelectTrigger className="w-[68px] shrink-0" aria-label="Pays du compte bancaire">
            <span className="font-semibold">{country}</span>
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            inputMode={cfg.code === "BE" ? "numeric" : "text"}
            value={formatIBAN(full)}
            onChange={(e) => onInput(e.target.value)}
            onBlur={onBlur}
            placeholder={cfg.code === "BE" ? "BE.. .... .... ...." : `${cfg.code}.. .... ....`}
            className={[
              "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors tracking-wide",
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
