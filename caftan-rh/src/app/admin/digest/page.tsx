// Daily digest history + manual trigger.

import { Sun, Moon, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManualTriggerButtons } from "./manual-trigger";

type DigestRun = {
  id: string;
  slot: string;
  for_date: string;
  markdown_summary: string | null;
  top_3_priorities: string[] | null;
  cost_usd: number | null;
  recipients_count: number | null;
  ai_audit_id: string | null;
  created_at: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(md: string): string {
  // Minimal renderer for our digest output. Handles ##, #, **bold**, lists.
  const safe = escapeHtml(md);
  return safe
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return `<h3 class="font-bold text-base mt-3 mb-1">${line.slice(3)}</h3>`;
      if (line.startsWith("# ")) return `<h2 class="font-bold text-lg mb-2">${line.slice(2)}</h2>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return "";
      return `<p class="my-1">${line}</p>`;
    })
    .join("\n")
    .replace(/(<li>[\s\S]*?<\/li>\s*)+/g, (m) => `<ul class="list-disc pl-5 my-2">${m}</ul>`)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function slotLabel(slot: string): string {
  return slot === "morning" ? "Matin (07h)" : slot === "evening" ? "Soir (18h)" : slot;
}

export default async function DigestPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("digest_runs")
    .select("*")
    .order("for_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = (data ?? []) as DigestRun[];
  const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY;

  // Group by date
  const byDate = new Map<string, DigestRun[]>();
  for (const r of rows) {
    const arr = byDate.get(r.for_date) ?? [];
    arr.push(r);
    byDate.set(r.for_date, arr);
  }
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Digest IA</h1>
          <p className="text-sm text-ink-2">
            Synthèse quotidienne 7h00 et 18h00. Top 3 priorités + résumé Markdown.
          </p>
        </div>
        <ManualTriggerButtons />
      </div>

      {!apiKeyConfigured ? (
        <div className="rounded-md border border-warn-light bg-warn-light/40 p-3 text-xs text-warn">
          <Sparkles className="inline h-3.5 w-3.5 mr-1" />
          <code>ANTHROPIC_API_KEY</code> non configurée — les digests utilisent un résumé de
          fallback construit à partir des chiffres bruts. Aucun crash, aucun appel IA.
        </div>
      ) : null}

      {sortedDates.length === 0 ? (
        <Card className="p-12 text-center text-ink-3">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucun digest pour le moment.</p>
          <p className="text-xs mt-1">Le cron déclenchera à 7h et 18h, ou clique sur un bouton ci-dessus.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dayRows = byDate.get(date) ?? [];
            return (
              <div key={date} className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                  {new Date(date).toLocaleDateString("fr-BE", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                {dayRows.map((r) => {
                  const isMorning = r.slot === "morning";
                  const Icon = isMorning ? Sun : Moon;
                  const top3 = Array.isArray(r.top_3_priorities) ? r.top_3_priorities : [];
                  return (
                    <Card key={r.id} className="overflow-hidden">
                      <div className="flex items-center gap-2 p-3 border-b border-line bg-surface-2">
                        <div className="h-7 w-7 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-sm">{slotLabel(r.slot)}</div>
                          <div className="text-[11px] text-ink-3">
                            Généré le {new Date(r.created_at).toLocaleString("fr-BE")} ·
                            {r.recipients_count ? ` ${r.recipients_count} destinataires · ` : " "}
                            {r.cost_usd ? `coût ${Number(r.cost_usd).toFixed(4)}$` : "coût 0$"}
                          </div>
                        </div>
                        <Badge variant="muted">{r.slot}</Badge>
                      </div>

                      {top3.length > 0 ? (
                        <div className="p-3 border-b border-line">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                            Top 3 priorités
                          </div>
                          <ol className="space-y-1.5">
                            {top3.map((p, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className="font-mono font-bold text-gold-dark text-xs mt-0.5">
                                  {i + 1}.
                                </span>
                                <span>{p}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}

                      {r.markdown_summary ? (
                        <div
                          className="p-4 prose prose-sm max-w-none text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(r.markdown_summary),
                          }}
                        />
                      ) : (
                        <div className="p-4 text-sm text-ink-3">Aucun résumé généré.</div>
                      )}
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
