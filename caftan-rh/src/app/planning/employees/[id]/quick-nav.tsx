"use client";

// Karim 2026-05-31 task #66 : nav rapide style Linear/Notion - liens vers
// les sections de la fiche avec scroll-spy actif.

import { useEffect, useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const SECTIONS: NavItem[] = [
  { id: "form-admin", label: "Identité", icon: "👤" },
  { id: "quota", label: "Quota", icon: "📊" },
  { id: "availability", label: "Dispos", icon: "📅" },
  { id: "sites", label: "Sites", icon: "🏢" },
  { id: "tuya", label: "Empreintes", icon: "👆" },
  { id: "advance", label: "Avance", icon: "💰" },
  { id: "embauche", label: "Embauche", icon: "📄" },
  { id: "danger", label: "Danger", icon: "⚠️" },
];

export function QuickNav() {
  const [activeId, setActiveId] = useState<string>("form-admin");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 200);
      // Trouve la section visible la plus haute dans le viewport
      let best: { id: string; top: number } | null = null;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 200 && rect.bottom > 100) {
          if (!best || rect.top > best.top) best = { id: s.id, top: rect.top };
        }
      }
      if (best) setActiveId(best.id);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div
      className={`hidden xl:block fixed right-6 top-1/2 -translate-y-1/2 z-30 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="bg-surface/95 backdrop-blur-md border border-line rounded-xl p-1.5 shadow-lg space-y-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full ${
              activeId === s.id
                ? "bg-foreground text-background"
                : "text-ink-3 hover:text-ink-1 hover:bg-muted"
            }`}
            title={s.label}
          >
            <span className="text-sm">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
