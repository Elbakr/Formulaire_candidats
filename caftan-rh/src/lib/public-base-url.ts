// Karim 2026-06-01 : helper SERVER-ONLY pour resoudre la base URL publique
// utilisee dans les mails sortants (magic links, signature contrat, fiches
// paie, pre-interview, etc.).
//
// Karim 2026-06-07 : refactor critique. Avant, TUNNEL_URL.txt etait lu en
// priorite, y compris en prod Vercel. Resultat : les mails pointaient vers
// une URL Cloudflare jetable qui mourait des que le PC etait eteint -> les
// destinataires (candidats, employes) ouvraient une page introuvable.
//
// Nouveau comportement :
//   - En prod Vercel (process.env.VERCEL = "1") : on IGNORE TUNNEL_URL.txt
//     et on prend l'alias permanent (NEXT_PUBLIC_SITE_URL > VERCEL_PROJECT_PRODUCTION_URL
//     > VERCEL_URL).
//   - En dev local : TUNNEL_URL.txt en priorite (tests mobile / tunnel),
//     fallback env vars, fallback http://localhost:3000.

import "server-only";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/**
 * Lit l'URL active depuis TUNNEL_URL.txt si dispo et bien formee.
 * Renvoie null si fichier absent / illisible / contenu invalide.
 * Note : non appele en prod Vercel.
 */
export function readActiveTunnelUrl(): string | null {
  try {
    const tunnelPath = resolvePath(process.cwd(), "TUNNEL_URL.txt");
    const txt = readFileSync(tunnelPath, "utf8");
    const firstLine = txt.split(/\r?\n/)[0].trim().replace(/^﻿/, "");
    if (
      firstLine.startsWith("https://") &&
      (firstLine.includes("trycloudflare.com") || firstLine.includes("loca.lt") || firstLine.includes("ngrok"))
    ) {
      return firstLine.replace(/\/+$/, "");
    }
  } catch {
    // silent
  }
  return null;
}

function envFallback(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000"
  );
}

/**
 * Renvoie la base URL publique courante. Toujours sans trailing slash.
 *
 * En prod Vercel : alias permanent (jamais le tunnel).
 * En dev local : tunnel cloudflare si actif, sinon env vars, sinon localhost.
 */
export function getPublicBaseUrl(override?: string): string {
  if (override) return sanitizeUrl(override);

  if (process.env.VERCEL) {
    const fromVercelAlias = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const fromVercelDeploy = process.env.VERCEL_URL;
    const resolved =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_BASE_URL ??
      (fromVercelAlias ? `https://${fromVercelAlias}` : undefined) ??
      (fromVercelDeploy ? `https://${fromVercelDeploy}` : undefined) ??
      "https://caftan-rh.vercel.app"; // dernier fallback hard-code, l'alias prod connu
    return sanitizeUrl(resolved);
  }

  const fromTunnel = readActiveTunnelUrl();
  if (fromTunnel) return sanitizeUrl(fromTunnel);
  return sanitizeUrl(envFallback());
}

// Karim 2026-06-13 : URL pour les liens ENVOYES A UN DESTINATAIRE EXTERNE
// (candidat / futur travailleur / employe) dans un mail.
//
// Probleme constate : un lien "infos manquantes" est parti en
// http://localhost:3000/... parce que le mail a ete declenche depuis le PC en
// dev (NEXT_PUBLIC_APP_URL=localhost dans .env.local). Un externe ne peut
// evidemment pas ouvrir localhost. Le tunnel Cloudflare jetable est tout aussi
// fragile (meurt PC eteint).
//
// Regle dure : un lien externe ne doit JAMAIS dependre de l'endroit d'ou il
// part. On rejette localhost ET le tunnel jetable, et on retombe toujours sur
// l'alias prod stable, joignable 24/7. Un vrai domaine custom
// (NEXT_PUBLIC_SITE_URL non-localhost / non-tunnel) reste prioritaire.
const STABLE_PROD_URL = "https://caftan-rh.vercel.app";

// Karim 2026-06-15 : un BOM ou des caracteres de controle en tete d'une env var
// corrompaient l'URL des liens sortants (ex. lien de signature ->
// "<BOM>https://.../sign/..." -> 404 cote candidat). On nettoie systematiquement
// (BOM + caracteres de controle) AVANT toute utilisation/comparaison.
function sanitizeUrl(s: string): string {
  return s
    .replace(/﻿/g, "")
    .replace(/\p{Cc}/gu, "")
    .trim()
    .replace(/\/+$/, "");
}

function isUnreachableForExternal(u: string | undefined | null): boolean {
  if (!u) return true;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u)) return true;
  if (/trycloudflare\.com|loca\.lt|ngrok/.test(u)) return true;
  return false;
}

export function getOutboundBaseUrl(): string {
  const explicit = sanitizeUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "",
  );
  if (explicit && !isUnreachableForExternal(explicit)) {
    return explicit;
  }
  return STABLE_PROD_URL;
}
