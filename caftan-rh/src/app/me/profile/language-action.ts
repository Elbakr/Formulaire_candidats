"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";

/**
 * Met à jour la préférence de langue.
 *
 * - Toujours pose le cookie `lang` (1 an, path /, sameSite lax).
 * - Si user authentifié, persiste aussi dans `profiles.language_preference`.
 * - L'app continue de fonctionner même si l'écriture DB échoue (cookie suffit).
 *
 * Appelé depuis `<LangToggle>` (header) — pas besoin de role check, chaque
 * profil édite seulement son propre `language_preference` (RLS ok via auth.uid).
 */
export async function updateLanguagePreferenceAction(
  locale: Locale,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (locale !== "fr" && locale !== "nl") {
    return { ok: false, error: "Locale invalide" };
  }

  // 1. Cookie — set même si pas authentifié (page candidat publique).
  const cookieStore = await cookies();
  cookieStore.set("lang", locale, {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // 2. Persist en DB si user connecté (best effort).
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ language_preference: locale })
        .eq("id", user.id);
    }
  } catch {
    /* cookie reste source de vérité côté client */
  }

  // Forcer un re-render des pages /me/* pour appliquer la nouvelle langue.
  revalidatePath("/me", "layout");
  revalidatePath("/pre-interview", "layout");

  return { ok: true };
}
