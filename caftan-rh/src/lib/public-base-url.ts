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
  if (override) return override.replace(/\/+$/, "");

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
    return resolved.replace(/\/+$/, "");
  }

  const fromTunnel = readActiveTunnelUrl();
  if (fromTunnel) return fromTunnel;
  return envFallback().replace(/\/+$/, "");
}
