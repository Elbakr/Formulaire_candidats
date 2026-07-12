// Karim 2026-07-12 : helpers PURS du verrouillage appareil (hors "use server" pour
// pouvoir exporter des non-fonctions/sync). Utilisés côté serveur uniquement.

import crypto from "node:crypto";

export const TABLET_BIND_COOKIE_PREFIX = "tabbind_";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
