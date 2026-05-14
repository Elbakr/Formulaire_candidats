// Strip horizontal de navigation entre sites, visible en haut de la fiche
// /planning/sites/[code]. Karim 14/05 : "quand on clique sur un site, on
// devrait pouvoir scroller ou choisir un autre site sans revenir a la liste."
//
// Server component : render des links Next, scroll horizontal natif sur mobile,
// preservation du query param ?week=... pour rester sur la meme semaine.

import Link from "next/link";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

export type SiteNavSite = {
  id: string;
  code: string;
  name: string;
  abbr: string | null;
  color: string | null;
  light_color: string | null;
};

export function SiteNavigator({
  sites,
  currentCode,
  weekISO,
}: {
  sites: SiteNavSite[];
  currentCode: string;
  /** ?week=... a preserver dans les links. */
  weekISO?: string;
}) {
  const idx = sites.findIndex((s) => s.code.toUpperCase() === currentCode.toUpperCase());
  const prev = idx > 0 ? sites[idx - 1] : null;
  const next = idx >= 0 && idx < sites.length - 1 ? sites[idx + 1] : null;
  const q = weekISO ? `?week=${weekISO}` : "";

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Link
        href="/planning/sites"
        title="Liste des sites"
        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-line text-ink-2 hover:border-gold hover:text-gold-dark transition-colors shrink-0"
      >
        <List className="h-3.5 w-3.5" />
      </Link>

      {prev ? (
        <Link
          href={`/planning/sites/${prev.code}${q}`}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-line text-ink-2 hover:border-gold hover:text-gold-dark transition-colors shrink-0"
          title={`Site precedent : ${prev.name}`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase">{prev.abbr ?? prev.code}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center h-8 w-9 rounded-md border border-line/50 text-ink-3/50 shrink-0">
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="flex-1 overflow-x-auto scroll-smooth-touch -mx-1 px-1">
        <div className="flex items-center gap-1">
          {sites.map((s) => {
            const isCurrent = s.code.toUpperCase() === currentCode.toUpperCase();
            return (
              <Link
                key={s.id}
                href={`/planning/sites/${s.code}${q}`}
                title={s.name}
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-bold border transition-colors shrink-0 ${
                  isCurrent
                    ? "border-gold bg-gold text-[#1a1a0d] shadow-sm"
                    : "border-line text-ink-2 hover:border-gold-dark hover:text-gold-dark"
                }`}
                style={
                  !isCurrent && s.light_color
                    ? { backgroundColor: s.light_color }
                    : undefined
                }
              >
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-white font-bold text-[10px]"
                  style={{ backgroundColor: s.color ?? "#666" }}
                >
                  {s.abbr ?? s.code}
                </span>
                <span className="hidden sm:inline">{s.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {next ? (
        <Link
          href={`/planning/sites/${next.code}${q}`}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-line text-ink-2 hover:border-gold hover:text-gold-dark transition-colors shrink-0"
          title={`Site suivant : ${next.name}`}
        >
          <span className="text-[11px] font-bold uppercase">{next.abbr ?? next.code}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center h-8 w-9 rounded-md border border-line/50 text-ink-3/50 shrink-0">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
