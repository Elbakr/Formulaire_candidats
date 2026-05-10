"use client";

import { useEffect, useState } from "react";
import { localeFromCookie, type Locale } from "@/lib/i18n";

/**
 * Hook client pour lire la locale depuis le cookie `lang`.
 *
 * Avant le mount on retourne "fr" pour éviter un mismatch SSR/CSR. Après le
 * premier render on lit le cookie réel. Pour les composants où le SSR serveur
 * peut déjà calculer la locale, préférer passer la locale en prop plutôt que
 * de dépendre uniquement de ce hook.
 */
export function useLocale(initial: Locale = "fr"): Locale {
  const [locale, setLocale] = useState<Locale>(initial);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const v = localeFromCookie(document.cookie);
    setLocale(v);
  }, []);
  return locale;
}
