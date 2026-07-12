"use server";

// Karim 2026-07-12 : enrôlement d'UN appareil pour un lien tablette. À la 1re
// ouverture (tablette non encore enrôlée), l'opérateur clique « Activer » : on
// génère un secret d'appareil, on le pose en cookie httpOnly SUR CET APPAREIL, et on
// stocke son empreinte (sha256) sur la tablette. Le lien devient alors refusé sur
// tout autre appareil (cookie manquant / empreinte différente).

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { sha256, TABLET_BIND_COOKIE_PREFIX } from "./binding";

const TEN_YEARS = 60 * 60 * 24 * 3650;

export async function enrollTabletDeviceAction(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 24) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("tablet_devices")
    .select("code, active, bound_secret")
    .eq("token", t)
    .maybeSingle();
  const row = data as { code: string; active: boolean; bound_secret: string | null } | null;
  if (!row || !row.active) return { ok: false, error: "Lien invalide ou tablette désactivée." };
  // Déjà enrôlée : on n'écrase JAMAIS en silence (sinon un 2e appareil volerait le
  // lien). Réinitialisation = réservée à l'admin (réglages).
  if (row.bound_secret) {
    return { ok: false, error: "Cette tablette est déjà enrôlée sur un appareil. Demande à l'admin de la réinitialiser." };
  }

  const secret = crypto.randomBytes(32).toString("base64url");
  const { error } = await admin
    .from("tablet_devices")
    .update({ bound_secret: sha256(secret), bound_at: new Date().toISOString() })
    .eq("token", t)
    .is("bound_secret", null); // garde-fou anti-course : ne lie que si toujours libre
  if (error) return { ok: false, error: error.message };

  const c = await cookies();
  c.set(`${TABLET_BIND_COOKIE_PREFIX}${row.code}`, secret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: TEN_YEARS,
    path: "/",
  });
  return { ok: true };
}
