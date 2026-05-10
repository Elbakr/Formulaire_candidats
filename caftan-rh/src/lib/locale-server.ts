import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { localeFromCookie, type Locale } from "./i18n";

/**
 * Détermine la locale active côté server.
 *
 * Ordre de priorité :
 * 1. Cookie `lang=fr|nl` (set par <LangToggle> ou aligné depuis le profil).
 * 2. `profiles.language_preference` si user connecté.
 * 3. Fallback "fr".
 *
 * Toujours synchrone-friendly : aucune erreur de DB ne peut faire crasher la page.
 */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const cookieLang = c.get("lang")?.value;
  const fromCookie = localeFromCookie(cookieLang);
  if (cookieLang === "fr" || cookieLang === "nl") return fromCookie;

  // Fallback : préférence sauvée en DB
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("language_preference")
        .eq("id", user.id)
        .maybeSingle();
      const pref = (data as { language_preference?: string | null } | null)
        ?.language_preference;
      if (pref === "fr" || pref === "nl") return pref;
    }
  } catch {
    /* ignore — l'app doit toujours afficher quelque chose */
  }
  return "fr";
}
