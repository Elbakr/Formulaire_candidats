"use client";

// Karim 2026-06-02 : rendu FAQ client. Recherche + accordeons par categorie.
// Aucun mix entre roles : seules les categories du role courant sont rendues.

import { useState, useMemo } from "react";
import {
  Search, ChevronDown, HelpCircle,
  Globe, Activity, Wallet, FileSignature, FileX, ShieldCheck,
  Calendar, Users, UserCheck, Mail, User, FileText, Star,
  type LucideIcon,
} from "lucide-react";
import type { FaqRoleContent } from "@/lib/faq-content";

const ICONS: Record<string, LucideIcon> = {
  Globe, Activity, Wallet, FileSignature, FileX, ShieldCheck,
  Calendar, Users, UserCheck, Mail, User, FileText, Star, HelpCircle,
};

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-purple-100 text-purple-800" },
  rh: { label: "RH", color: "bg-blue-100 text-blue-800" },
  manager: { label: "Manager", color: "bg-amber-100 text-amber-800" },
  candidate: { label: "Travailleur", color: "bg-green-100 text-green-800" },
};

export function FaqClient({ content, role, userName }: { content: FaqRoleContent; role: string; userName: string }) {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set([content.categories[0]?.id ?? ""]));

  const roleMeta = ROLE_LABEL[role] ?? ROLE_LABEL.candidate;

  const filtered = useMemo(() => {
    if (!search.trim()) return content.categories;
    const q = search.toLowerCase();
    return content.categories
      .map((c) => ({
        ...c,
        questions: c.questions.filter(
          (qa) => qa.q.toLowerCase().includes(q) || qa.a.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.questions.length > 0);
  }, [search, content.categories]);

  function toggleCat(id: string) {
    setOpenCats((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function expandAll() {
    setOpenCats(new Set(filtered.map((c) => c.id)));
  }
  function collapseAll() {
    setOpenCats(new Set());
  }

  // Auto-expand on search
  if (search && openCats.size !== filtered.length) {
    setOpenCats(new Set(filtered.map((c) => c.id)));
  }

  const totalQ = content.categories.reduce((sum, c) => sum + c.questions.length, 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-safe">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="w-6 h-6 text-gold" />
          <h1 className="text-2xl font-bold">FAQ — {userName}</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleMeta.color}`}>
            {roleMeta.label}
          </span>
        </div>
        <p className="text-sm text-ink-2">{content.intro}</p>
        <p className="text-[11px] text-ink-3 mt-1">
          {totalQ} question{totalQ > 1 ? "s" : ""} dans {content.categories.length} catégorie{content.categories.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="sticky top-0 z-20 bg-background pt-2 pb-3 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3 py-2 shadow-sm">
          <Search className="w-4 h-4 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une question..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-3"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-ink-3 hover:text-ink">×</button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px]">
          <button onClick={expandAll} className="px-2 py-0.5 rounded bg-muted hover:bg-line">Tout ouvrir</button>
          <button onClick={collapseAll} className="px-2 py-0.5 rounded bg-muted hover:bg-line">Tout fermer</button>
        </div>
      </div>

      <div className="space-y-3 mt-3">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-ink-3">
            Aucune question trouvée pour <span className="font-semibold">{search}</span>.
          </div>
        )}

        {filtered.map((cat) => {
          const Icon = ICONS[cat.icon] ?? HelpCircle;
          const isOpen = openCats.has(cat.id);
          return (
            <div key={cat.id} className="border border-line rounded-2xl overflow-hidden bg-surface">
              <button
                onClick={() => toggleCat(cat.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 active:bg-muted/50"
              >
                <Icon className="w-4 h-4 text-gold flex-shrink-0" />
                <span className="flex-1 text-left font-semibold text-sm">{cat.title}</span>
                <span className="text-[10px] text-ink-3 font-mono">{cat.questions.length}</span>
                <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="border-t border-line/40 divide-y divide-line/30">
                  {cat.questions.map((qa, idx) => (
                    <details key={idx} className="group">
                      <summary className="p-3 pl-12 pr-4 cursor-pointer text-sm font-medium hover:bg-muted/20 active:bg-muted/40 flex items-center gap-2">
                        <span className="flex-1">{qa.q}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-3 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-12 pb-4 pt-1 text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap">
                        {renderAnswer(qa.a)}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-3 bg-muted/30 rounded-xl text-xs text-ink-3">
        <strong>Ta question n&apos;est pas listée ?</strong>{" "}
        {role === "candidate" ? (
          <>Envoie un mail à <a href="mailto:hr@caftanfactory.com" className="text-blue-700 underline">hr@caftanfactory.com</a></>
        ) : (
          <>Ajoute la question + réponse dans <code className="bg-muted px-1 py-0.5 rounded">caftan-rh/src/lib/faq-content.ts</code> (catégorie {role.toUpperCase()})</>
        )}
      </div>
    </div>
  );
}

/**
 * Karim 2026-06-02 : rendu basique markdown-like.
 * - Liens [text](url) → <a>
 * - `code` inline → <code>
 */
function renderAnswer(text: string): React.ReactNode {
  // Split sur les patterns spéciaux
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Lien markdown
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    // Code inline
    const codeMatch = remaining.match(/`([^`]+)`/);

    const linkIdx = linkMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (linkIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (linkIdx < codeIdx && linkMatch) {
      const before = remaining.slice(0, linkIdx);
      if (before) parts.push(before);
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target={linkMatch[2].startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="text-blue-700 underline hover:text-blue-900"
        >
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.slice(linkIdx + linkMatch[0].length);
    } else if (codeMatch) {
      const before = remaining.slice(0, codeIdx);
      if (before) parts.push(before);
      parts.push(
        <code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts;
}
