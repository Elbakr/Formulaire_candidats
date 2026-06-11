"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Mail, Paperclip, AlertCircle, ExternalLink } from "lucide-react";
import { SOURCE_LABELS, SOURCE_COLORS, type MailSource } from "@/lib/outbound-mail-types";

interface OutboundMail {
  id: string;
  sent_at: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  body: string | null;
  source: MailSource;
  source_ref: string | null;
  status: "sent" | "failed" | "opened" | "replied";
  error_message: string | null;
  attachments: Array<{ name: string; url: string }>;
  employee_id: string | null;
  employee?: { id: string; full_name: string } | null;
}

export function MailsFilters({
  allMails,
  sourcesAvailable,
}: {
  allMails: OutboundMail[];
  sourcesAvailable: string[];
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");

  const filtered = useMemo(() => {
    return allMails.filter((m) => {
      if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !m.recipient_email.toLowerCase().includes(s) &&
          !(m.recipient_name ?? "").toLowerCase().includes(s) &&
          !m.subject.toLowerCase().includes(s) &&
          !(m.employee?.full_name ?? "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [allMails, search, sourceFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Rechercher destinataire, sujet, employé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3 font-semibold">Source :</span>
          <button
            type="button"
            onClick={() => setSourceFilter("all")}
            className={`px-2 py-1 text-xs rounded ${
              sourceFilter === "all" ? "bg-foreground text-background" : "bg-muted hover:bg-line"
            }`}
          >
            Toutes
          </button>
          {sourcesAvailable.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSourceFilter(s)}
              className={`px-2 py-1 text-xs rounded ${
                sourceFilter === s ? "bg-foreground text-background" : "bg-muted hover:bg-line"
              }`}
            >
              {SOURCE_LABELS[s as MailSource] ?? s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3 font-semibold">Statut :</span>
          {(["all", "sent", "failed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 text-xs rounded ${
                statusFilter === s ? "bg-foreground text-background" : "bg-muted hover:bg-line"
              }`}
            >
              {s === "all" ? "Tous" : s === "sent" ? "Envoyés" : "Échecs"}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="text-xs text-muted-foreground px-4 py-2 border-b">
          {filtered.length} / {allMails.length} mails affichés
        </div>
        <div className="divide-y">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucun mail trouvé.</div>
          )}
          {filtered.map((m) => (
            <MailRow key={m.id} m={m} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function MailRow({ m }: { m: OutboundMail }) {
  const date = new Date(m.sent_at);
  const sourceColor = SOURCE_COLORS[m.source] ?? "bg-gray-100 text-gray-800";
  const sourceLabel = SOURCE_LABELS[m.source] ?? m.source;
  return (
    <div className={`px-4 py-3 hover:bg-muted/20 ${m.status === "failed" ? "bg-red-50/50" : ""}`}>
      <div className="flex items-start gap-3">
        <Mail className={`w-4 h-4 mt-0.5 flex-shrink-0 ${m.status === "failed" ? "text-red-600" : "text-blue-600"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{m.subject}</span>
            <Badge className={`text-[10px] ${sourceColor}`}>{sourceLabel}</Badge>
            {m.status === "failed" && (
              <Badge className="bg-red-100 text-red-800 text-[10px] flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Échec
              </Badge>
            )}
            {m.attachments && m.attachments.length > 0 && (
              <Badge variant="muted" className="text-[10px] flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> {m.attachments.length}
              </Badge>
            )}
          </div>
          <div className="text-xs text-ink-3 mt-1 flex items-center gap-2 flex-wrap">
            <span>→ {m.recipient_name ?? m.recipient_email}</span>
            <span className="text-ink-3">·</span>
            <span className="font-mono">{m.recipient_email}</span>
            {m.employee && (
              <>
                <span className="text-ink-3">·</span>
                <Link
                  href={`/planning/employees/${m.employee.id}`}
                  className="text-blue-700 hover:underline"
                >
                  Fiche {m.employee.full_name}
                </Link>
              </>
            )}
          </div>
          {m.body && (
            <details className="mt-2">
              <summary className="text-xs text-blue-700 hover:underline cursor-pointer">
                Voir contenu
              </summary>
              <pre className="text-[11px] bg-muted/30 p-2 rounded mt-1 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {m.body}
              </pre>
            </details>
          )}
          {m.attachments && m.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                >
                  <Paperclip className="w-3 h-3" />
                  {a.name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
          {m.error_message && (
            <div className="text-xs text-red-700 mt-1 italic">⚠ {m.error_message}</div>
          )}
        </div>
        <div className="text-[10px] text-ink-3 flex-shrink-0 text-right">
          {date.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
          <br />
          {date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
