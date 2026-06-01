// Karim 2026-06-01 : helper SERVER-ONLY pour résoudre la base URL publique
// utilisée dans les mails sortants (magic links, signature contrat, fiches
// paie, pre-interview, etc.).
//
// Priorité :
//   1. TUNNEL_URL.txt (mis à jour auto par scripts/tunnel-keeper.ps1)
//   2. NEXT_PUBLIC_SITE_URL
//   3. NEXT_PUBLIC_APP_URL
//   4. NEXT_PUBLIC_BASE_URL
//   5. http://localhost:3000 (fallback ultime, ne marche que sur le PC)
//
// Pas de serveur dédié pour l'instant ; le tunnel cloudflared change à
// chaque restart, donc on lit le fichier à chaque appel (pas de cache).

import "server-only";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/**
 * Lit l'URL active depuis TUNNEL_URL.txt si dispo et bien formée.
 * Renvoie null si fichier absent / illisible / contenu invalide.
 */
export function readActiveTunnelUrl(): string | null {
  try {
    const tunnelPath = resolvePath(process.cwd(), "TUNNEL_URL.txt");
    const txt = readFileSync(tunnelPath, "utf8");
    // BOM-strip + first line
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

/**
 * Renvoie la base URL publique courante.
 * Toujours sans trailing slash.
 */
export function getPublicBaseUrl(override?: string): string {
  if (override) return override.replace(/\/+$/, "");
  const fromTunnel = readActiveTunnelUrl();
  if (fromTunnel) return fromTunnel;
  const env =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  return env.replace(/\/+$/, "");
}
