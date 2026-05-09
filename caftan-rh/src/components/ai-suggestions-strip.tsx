"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DraftPayload = {
  drafts?: Array<{ tone: string; subject: string; body_html: string }>;
};

type AgentActionRow = {
  id: string;
  kind: string;
  ai_confidence: number | null;
  payload: DraftPayload | Record<string, unknown>;
  status: string;
  proposed_at: string;
};

/**
 * Strip de suggestions IA — 3 chips au-dessus d'un composer thread.
 *
 * Usage : <AiSuggestionsStrip applicationId="..." />
 *
 * Charge les agent_actions status='proposed' kind='reply_draft' filtrées par application.
 * Hover/click sur un chip → expand un brouillon. Click "Approuver" → redirige vers
 * la page détail Inbox où l'utilisateur valide. Standalone : aucun import depuis Wave 1.
 */
export function AiSuggestionsStrip({
  applicationId,
  count = 3,
}: {
  applicationId: string;
  count?: number;
}) {
  const [rows, setRows] = useState<AgentActionRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    async function load() {
      try {
        const { data } = await supabase
          .from("agent_actions")
          .select("id, kind, ai_confidence, payload, status, proposed_at")
          .eq("status", "proposed")
          .eq("kind", "reply_draft")
          .eq("target_type", "application")
          .eq("target_id", applicationId)
          .order("proposed_at", { ascending: false })
          .limit(count);
        if (!cancelled) setRows((data ?? []) as AgentActionRow[]);
      } catch {
        /* env not configured */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [applicationId, count]);

  if (loading) return null;
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-surface px-3 py-2 text-[11px] text-ink-3 flex items-center gap-2">
        <Sparkles className="h-3 w-3" />
        Aucune suggestion IA pour ce candidat.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="h-3.5 w-3.5 text-gold-dark" />
        <span className="text-[11px] uppercase tracking-wider font-bold text-ink-3">
          Suggestions IA
        </span>
        {rows.flatMap((r) => {
          const drafts = ((r.payload as DraftPayload).drafts ?? []) as Array<{
            tone: string;
            subject: string;
            body_html: string;
          }>;
          return drafts.map((d, idx) => {
            const chipId = `${r.id}-${idx}`;
            const active = open === chipId;
            return (
              <button
                key={chipId}
                type="button"
                onClick={() => setOpen(active ? null : chipId)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  active
                    ? "bg-gold text-[#1a1a0d] border-gold"
                    : "bg-gold-light text-gold-dark border-gold-light hover:border-gold"
                }`}
              >
                {labelTone(d.tone)} · {trim(d.subject, 28)}
              </button>
            );
          });
        })}
      </div>

      {open ? (
        (() => {
          const [actionId, draftIdxStr] = open.split("-");
          const draftIdx = parseInt(draftIdxStr, 10);
          const row = rows.find((r) => r.id === actionId);
          if (!row) return null;
          const drafts = ((row.payload as DraftPayload).drafts ?? []) as Array<{
            tone: string;
            subject: string;
            body_html: string;
          }>;
          const draft = drafts[draftIdx];
          if (!draft) return null;
          return (
            <div className="rounded-md border border-line bg-surface p-3 space-y-2">
              <div className="text-xs">
                <span className="text-[10px] uppercase tracking-wider font-bold text-gold-dark">
                  {draft.tone}
                </span>{" "}
                · <strong>{draft.subject}</strong>
              </div>
              <div
                className="prose prose-sm max-w-none text-xs"
                dangerouslySetInnerHTML={{ __html: draft.body_html }}
              />
              <div className="flex items-center gap-2">
                <Link
                  href={`/rh/inbox/${actionId}`}
                  className="text-xs px-3 py-1.5 rounded-md bg-gold text-[#1a1a0d] font-bold hover:bg-gold-dark hover:text-white"
                >
                  Approuver dans l&apos;Inbox
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="text-xs text-ink-3 hover:text-ink"
                >
                  Fermer
                </button>
              </div>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}

function labelTone(tone: string): string {
  switch (tone) {
    case "formel":
      return "Formel";
    case "chaleureux":
      return "Chaleureux";
    case "court":
      return "Court";
    case "urgent":
      return "Urgent";
    default:
      return tone;
  }
}

function trim(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
