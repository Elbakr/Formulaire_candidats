"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { localeFromCookie, type Locale } from "@/lib/i18n";
import { updateLanguagePreferenceAction } from "@/app/me/profile/language-action";

/**
 * Toggle FR/NL compact dans le header.
 *
 * Mobile-first : 2 lettres, fond contrasté pour la langue active.
 * Au click :
 *   - set le cookie via server action (qui revalide aussi /me et /pre-interview)
 *   - appelle router.refresh() pour re-render avec la nouvelle locale
 */
export function LangToggle() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locale, setLocale] = useState<Locale>("fr");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setLocale(localeFromCookie(document.cookie));
    setMounted(true);
  }, []);

  function pick(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    startTransition(async () => {
      await updateLanguagePreferenceAction(next);
      router.refresh();
    });
  }

  // Avant mount : afficher quand même les deux boutons (SSR-safe). On choisit
  // FR par défaut visuellement, sera corrigé au mount sans flash important.
  const current: Locale = mounted ? locale : "fr";

  return (
    <div
      role="group"
      aria-label="Langue"
      className="inline-flex items-stretch rounded-md border border-white/15 overflow-hidden text-[11px] font-bold tracking-wider"
    >
      {(["fr", "nl"] as const).map((l) => {
        const active = current === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => pick(l)}
            disabled={pending}
            aria-pressed={active}
            title={l === "fr" ? "Français" : "Nederlands"}
            className={[
              "px-2 py-1 uppercase transition-colors min-w-[28px]",
              active
                ? "bg-gold text-[#1a1a0d]"
                : "text-white/70 hover:bg-white/10",
              pending ? "opacity-60 cursor-wait" : "",
            ].join(" ")}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
