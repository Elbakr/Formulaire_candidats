"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, Search } from "lucide-react";
import { NavIcon } from "@/components/nav-icon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Item = { href: string; label: string; icon: string };
type Group = { id: string; label: string; icon: string; items: Item[] };

// Karim 2026-06-11 : bouton "Toutes les fonctions" -> ouvre un panneau avec
// TOUTES les fonctions (groupees par section) + recherche. Les fonctions
// "ultra utiles" sont en grandes tuiles sur la page ; tout le reste est ici.
export function AllFunctionsMenu({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const needle = q.trim().toLowerCase();

  const filtered = groups
    .map((g) => ({
      ...g,
      items: needle ? g.items.filter((i) => i.label.toLowerCase().includes(needle)) : g.items,
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 active:scale-95 transition-all min-h-[44px]"
      >
        <LayoutGrid className="h-4 w-4 text-gold-dark" />
        Toutes les fonctions
        <span className="text-[11px] font-bold text-ink-3 bg-surface-2 rounded-full px-1.5 py-0.5">{total}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Toutes les fonctions</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une fonction…"
              className="w-full rounded-md border border-line bg-canvas pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
            />
          </div>

          <div className="overflow-y-auto -mx-1 px-1 space-y-4 mt-1">
            {filtered.length === 0 ? (
              <div className="text-center text-sm text-ink-3 py-8">Aucune fonction ne correspond.</div>
            ) : (
              filtered.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                    <NavIcon name={g.icon} className="h-3.5 w-3.5" /> {g.label}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {g.items.map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs hover:bg-surface-2 hover:border-gold/40 transition-colors min-h-[40px]"
                      >
                        <NavIcon name={it.icon} className="h-4 w-4 text-ink-3 shrink-0" />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
