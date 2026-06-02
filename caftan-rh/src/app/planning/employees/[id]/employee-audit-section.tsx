// Karim 2026-06-02 : section audit log sur la fiche employee. Timeline
// unifiee : document_audit_log (partages/views) + clock_entry_corrections
// (corrections pointage). 20 dernieres entries.

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Eye, Download, Image as ImageIcon, FileText,
  Edit3, Trash2, Plus, Moon, History,
} from "lucide-react";

interface DocAuditRow {
  type: "doc";
  id: string;
  occurred_at: string;
  action: string;
  doc_type: string;
  doc_label: string | null;
  actor_name: string | null;
  recipient_email: string | null;
  channel: string | null;
  ip_address: string | null;
}

interface CorrRow {
  type: "correction";
  id: string;
  occurred_at: string;
  action: string;
  actor_name: string | null;
  reason: string | null;
  target_date: string | null;
}

type AuditRow = DocAuditRow | CorrRow;

const DOC_ACTION_META: Record<string, { label: string; icon: typeof Mail; cls: string }> = {
  share_email: { label: "Partage par mail", icon: Mail, cls: "bg-blue-100 text-blue-800" },
  share_link: { label: "Partage par lien", icon: Mail, cls: "bg-blue-100 text-blue-800" },
  view: { label: "Consultation", icon: Eye, cls: "bg-gray-100 text-gray-800" },
  download: { label: "Téléchargement", icon: Download, cls: "bg-cyan-100 text-cyan-800" },
  screenshot: { label: "Capture d'écran", icon: ImageIcon, cls: "bg-amber-100 text-amber-800" },
};

const CORR_ACTION_META: Record<string, { label: string; icon: typeof Mail; cls: string }> = {
  create_manual: { label: "Shift ajouté manuellement", icon: Plus, cls: "bg-blue-100 text-blue-800" },
  mark_rest_day: { label: "Jour de repos marqué", icon: Moon, cls: "bg-purple-100 text-purple-800" },
  edit_occurred_at: { label: "Heure modifiée", icon: Edit3, cls: "bg-amber-100 text-amber-800" },
  edit_kind: { label: "Type modifié", icon: Edit3, cls: "bg-amber-100 text-amber-800" },
  edit_site: { label: "Site modifié", icon: Edit3, cls: "bg-amber-100 text-amber-800" },
  delete: { label: "Pointage supprimé", icon: Trash2, cls: "bg-red-100 text-red-800" },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  payslip: "Fiche de paie",
  contract: "Contrat",
  cv: "CV",
  screening_pdf: "Questionnaire",
  misc: "Document",
};

export async function EmployeeAuditSection({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();

  const [docs, corrs] = await Promise.all([
    admin
      .from("document_audit_log")
      .select("id, occurred_at, action, doc_type, doc_label, actor_name, recipient_email, channel, ip_address")
      .eq("employee_id", employeeId)
      .order("occurred_at", { ascending: false })
      .limit(30),
    admin
      .from("clock_entry_corrections")
      .select("id, occurred_at, action, actor_name, reason, target_date")
      .eq("employee_id", employeeId)
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);

  const docRows: DocAuditRow[] = (docs.data ?? []).map((r) => ({ type: "doc" as const, ...(r as Omit<DocAuditRow, "type">) }));
  const corrRows: CorrRow[] = (corrs.data ?? []).map((r) => ({ type: "correction" as const, ...(r as Omit<CorrRow, "type">) }));

  // Merge + sort par occurred_at desc, limit 20
  const merged: AuditRow[] = [...docRows, ...corrRows]
    .sort((a, b) => (a.occurred_at > b.occurred_at ? -1 : 1))
    .slice(0, 20);

  return (
    <div id="audit" className="scroll-mt-20">
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            Historique partages & corrections
          </h2>
          <span className="text-xs text-ink-3">{merged.length} entries (20 max)</span>
        </div>

        {merged.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Aucune trace d&apos;activité pour cet employé.
          </div>
        )}

        <div className="divide-y divide-line/40">
          {merged.map((row) => {
            if (row.type === "doc") {
              const meta = DOC_ACTION_META[row.action] ?? { label: row.action, icon: FileText, cls: "bg-gray-100 text-gray-700" };
              const Icon = meta.icon;
              return (
                <div key={`d-${row.id}`} className="p-3 hover:bg-muted/20">
                  <div className="flex items-start gap-3">
                    <Icon className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                        <span className="text-xs font-medium">{DOC_TYPE_LABEL[row.doc_type] ?? row.doc_type}</span>
                        {row.doc_label && <span className="text-xs text-ink-3">· {row.doc_label}</span>}
                      </div>
                      <div className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-2 flex-wrap">
                        {row.actor_name && <span>Par {row.actor_name}</span>}
                        {row.recipient_email && <span>→ {row.recipient_email}</span>}
                        {row.channel && <span className="font-mono">({row.channel})</span>}
                        {row.ip_address && <span className="text-ink-3/70">{row.ip_address}</span>}
                      </div>
                    </div>
                    <div className="text-[10px] text-ink-3 text-right flex-shrink-0">
                      {new Date(row.occurred_at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                </div>
              );
            } else {
              const meta = CORR_ACTION_META[row.action] ?? { label: row.action, icon: Edit3, cls: "bg-gray-100 text-gray-700" };
              const Icon = meta.icon;
              return (
                <div key={`c-${row.id}`} className="p-3 hover:bg-muted/20">
                  <div className="flex items-start gap-3">
                    <Icon className="w-4 h-4 mt-0.5 text-amber-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                        {row.target_date && (
                          <span className="text-xs font-mono">{row.target_date}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-3 mt-0.5">
                        {row.actor_name && <span>Par {row.actor_name}</span>}
                      </div>
                      {row.reason && (
                        <div className="text-[11px] italic mt-1 text-ink-2">« {row.reason} »</div>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-3 text-right flex-shrink-0">
                      {new Date(row.occurred_at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </div>
      </Card>
    </div>
  );
}
