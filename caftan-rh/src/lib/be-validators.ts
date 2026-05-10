// Validateurs belges — NRN, IBAN, téléphone, code postal.
// Repris de l'ancien `recrutement.html` + `formulaire-candidat.html`.
//
// Tous les helpers retournent { valid, formatted?, error? } pour faciliter
// l'usage côté form (afficher l'erreur OU réécrire la valeur formatée).

export type ValidationResult = {
  valid: boolean;
  formatted?: string;
  error?: string;
};

// ─── NUMÉRO NATIONAL BELGE ────────────────────────────────────────────
// Format affiché : YY.MM.DD-NNN.CC (ex: 85.07.30-033.28)
// 11 chiffres totaux. Les 2 derniers chiffres = checksum.
//
// Algorithme :
//   - né avant 2000 : checksum = 97 - (premiers 9 chiffres) % 97
//   - né en 2000+   : checksum = 97 - ("2" + premiers 9 chiffres) % 97
//                     (en pratique : préfixer 2 → modulo)

export function normalizeNRN(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

export function formatNRN(input: string): string {
  const d = normalizeNRN(input).slice(0, 11);
  const parts: string[] = [];
  if (d.length >= 2) parts.push(d.slice(0, 2));
  if (d.length >= 4) parts.push(d.slice(2, 4));
  if (d.length >= 6) parts.push(d.slice(4, 6));
  // construit "YY.MM.DD"
  let head = parts.join(".");
  if (d.length < 6) {
    if (parts.length === 0) return d;
    head = parts.join(".");
    if (d.length > parts.length * 2) head += "." + d.slice(parts.length * 2);
    return head;
  }
  let result = head;
  if (d.length > 6) {
    const mid = d.slice(6, 9);
    result += "-" + mid;
    if (d.length > 9) {
      const tail = d.slice(9, 11);
      result += "." + tail;
    }
  }
  return result;
}

export function validateNRN(input: string): ValidationResult {
  const d = normalizeNRN(input);
  if (d.length === 0) return { valid: false, error: "Numéro national requis." };
  if (d.length !== 11) {
    return {
      valid: false,
      error: `${d.length} chiffres saisis, 11 attendus (format YY.MM.DD-NNN.CC).`,
    };
  }
  const body = d.slice(0, 9);
  const check = parseInt(d.slice(9, 11), 10);

  const calc1 = 97 - (parseInt(body, 10) % 97);
  // Pour les naissances 2000+ on préfixe "2" :
  const calc2 = 97 - (parseInt("2" + body, 10) % 97);

  if (calc1 !== check && calc2 !== check) {
    return {
      valid: false,
      error: "Numéro national invalide (checksum incorrect).",
    };
  }
  return { valid: true, formatted: formatNRN(d) };
}

// ─── IBAN BELGE ───────────────────────────────────────────────────────
// Format BE + 14 chiffres (16 caractères au total).
// Validation MOD-97 sur l'IBAN entier réarrangé.

export function normalizeIBAN(input: string): string {
  return (input ?? "").replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function formatIBAN(input: string): string {
  const c = normalizeIBAN(input);
  // Groupes de 4 séparés par un espace : BEXX XXXX XXXX XXXX
  return c.match(/.{1,4}/g)?.join(" ") ?? c;
}

/** Validation MOD-97 (norme ISO 13616). */
function ibanChecksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // Convertit lettres en chiffres : A=10, B=11, ..., Z=35
  let numeric = "";
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) numeric += String(ch.charCodeAt(0) - 55);
    else numeric += ch;
  }
  // MOD 97 sur grand nombre via découpe
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

export function validateBelgianIBAN(input: string): ValidationResult {
  const c = normalizeIBAN(input);
  if (c.length === 0) return { valid: false, error: "IBAN requis." };
  if (!c.startsWith("BE")) {
    return { valid: false, error: "IBAN belge attendu (commence par BE)." };
  }
  if (c.length !== 16) {
    return {
      valid: false,
      error: `${c.length} caractères saisis, 16 attendus (BE + 14 chiffres).`,
    };
  }
  if (!/^BE\d{14}$/.test(c)) {
    return { valid: false, error: "Caractères non numériques après BE." };
  }
  if (!ibanChecksumOk(c)) {
    return { valid: false, error: "IBAN invalide (contrôle MOD-97 échoué)." };
  }
  return { valid: true, formatted: formatIBAN(c) };
}

// ─── TÉLÉPHONE BELGE ──────────────────────────────────────────────────
// On accepte tout en entrée et on tente de canoniser en +32...
// Mobile : +32 4XX XX XX XX  (9 chiffres après +32)
// Fixe   : +32 X XXX XX XX   (8 chiffres après +32, hors 4)

export function normalizeBelgianPhone(input: string): string {
  let s = (input ?? "").replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("0")) s = "+32" + s.slice(1);
  if (!s.startsWith("+") && /^\d/.test(s)) s = "+32" + s;
  return s;
}

export function formatBelgianPhone(input: string): string {
  const c = normalizeBelgianPhone(input);
  if (!c.startsWith("+32")) return c;
  const rest = c.slice(3);
  if (rest.length === 9 && rest.startsWith("4")) {
    // Mobile : 4XX XX XX XX
    return `+32 ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
  }
  if (rest.length === 8) {
    return `+32 ${rest.slice(0, 1)} ${rest.slice(1, 4)} ${rest.slice(4, 6)} ${rest.slice(6, 8)}`;
  }
  return c;
}

export function validateBelgianPhone(input: string): ValidationResult {
  const c = normalizeBelgianPhone(input);
  if (!c) return { valid: false, error: "Téléphone requis." };
  if (!c.startsWith("+32")) {
    return { valid: false, error: "Numéro belge attendu (+32...)." };
  }
  const rest = c.slice(3);
  if (!/^\d+$/.test(rest)) return { valid: false, error: "Chiffres uniquement après +32." };
  if (rest.length !== 8 && rest.length !== 9) {
    return {
      valid: false,
      error: `${rest.length} chiffres après +32, 8 (fixe) ou 9 (mobile) attendus.`,
    };
  }
  return { valid: true, formatted: formatBelgianPhone(c) };
}

// ─── CODE POSTAL BELGE ────────────────────────────────────────────────
// 1000-9999 (4 chiffres). 1xxx-1299 = Bruxelles, 2xxx = Anvers, etc.

export function validateBelgianPostcode(input: string): ValidationResult {
  const c = (input ?? "").replace(/\D/g, "");
  if (!c) return { valid: false, error: "Code postal requis." };
  if (c.length !== 4) return { valid: false, error: "4 chiffres attendus." };
  const n = parseInt(c, 10);
  if (n < 1000 || n > 9999) {
    return { valid: false, error: "Code postal hors plage 1000-9999." };
  }
  return { valid: true, formatted: c };
}

/** Région Belgique à partir du code postal (Bruxelles / Wallonie / Flandre). */
export function regionFromPostcode(input: string): string | null {
  const r = validateBelgianPostcode(input);
  if (!r.valid) return null;
  const n = parseInt(r.formatted!, 10);
  if (n >= 1000 && n <= 1299) return "Bruxelles-Capitale";
  if ((n >= 1300 && n <= 1499) || (n >= 4000 && n <= 7999)) return "Wallonie";
  return "Flandre";
}
