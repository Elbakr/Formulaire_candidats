// Karim 2026-07-12 : helpers PURS du verrouillage appareil de la formation (hors
// "use server"). Serveur uniquement.
import crypto from "node:crypto";

export const FORM_BIND_COOKIE = "formbind";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
