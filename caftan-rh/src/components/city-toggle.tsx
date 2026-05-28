"use client";

// Karim 2026-05-25 : toggle Bruxelles / Anvers dans le header. Set le cookie
// et refresh la page pour que les Server Components re-rendent avec le bon
// filtre de ville.

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MapPin } from "lucide-react";

type City = "bruxelles" | "anvers" | "all";

export function CityToggle({ initial }: { initial: City }) {
  const router = useRouter();
  const [city, setCity] = useState<City>(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => { setCity(initial); }, [initial]);

  function switchTo(next: City) {
    if (next === city) return;
    document.cookie = `caftanrh_city=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setCity(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 p-0.5 text-[10px] font-bold">
      <MapPin className="h-3 w-3 text-white/60 ml-1" />
      <button
        type="button"
        onClick={() => switchTo("bruxelles")}
        disabled={pending}
        className={`px-2 py-1 rounded transition-colors ${
          city === "bruxelles" ? "bg-gold text-[#1a1a0d]" : "text-white/70 hover:text-white"
        }`}
        title="Voir les sites de Bruxelles"
      >
        BXL
      </button>
      <button
        type="button"
        onClick={() => switchTo("anvers")}
        disabled={pending}
        className={`px-2 py-1 rounded transition-colors ${
          city === "anvers" ? "bg-gold text-[#1a1a0d]" : "text-white/70 hover:text-white"
        }`}
        title="Voir les sites d'Anvers"
      >
        Anvers
      </button>
      <button
        type="button"
        onClick={() => switchTo("all")}
        disabled={pending}
        className={`px-2 py-1 rounded transition-colors ${
          city === "all" ? "bg-gold text-[#1a1a0d]" : "text-white/70 hover:text-white"
        }`}
        title="Voir tous les sites (BXL + Anvers)"
      >
        Tous
      </button>
    </div>
  );
}
