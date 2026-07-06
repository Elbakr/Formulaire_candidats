// Karim 2026-07-06 : section « Signalements du travailleur » sur la fiche RH.
// Liste les worker_reports (canal permanent /signaler/[token]) avec date,
// catégorie, message, statut, et un bouton 1-clic « Marquer traité ».

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquareWarning } from "lucide-react";
import { MarkReportHandledButton } from "./mark-report-handled-button";
import type { WorkerReportRow } from "@/lib/worker-reports";

const CATEGORY_LABEL: Record<string, string> = {
  remarque: "Remarque",
  anomalie: "Anomalie",
  info: "Info",
  autre: "Autre",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nouveau",
  read: "Lu",
  handled: "Traité",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  read: "bg-blue-100 text-blue-700",
  handled: "bg-green-100 text-green-700",
};

export async function WorkerReportsSection({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("worker_reports")
    .select("id, employee_id, category, message, status, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as WorkerReportRow[];
  const openCount = rows.filter((r) => r.status !== "handled").length;

  return (
    <Card id="worker-reports" className="overflow-hidden">
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <MessageSquareWarning className="w-4 h-4" /> Signalements du travailleur ({rows.length})
          {openCount > 0 ? (
            <Badge className="bg-amber-100 text-amber-800 text-[10px]">{openCount} à traiter</Badge>
          ) : null}
        </h2>
        <p className="text-[10px] text-ink-3 mt-0.5">
          Remarques, anomalies et infos envoyées par le travailleur via son lien permanent « Signaler à la direction ».
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-4 text-center text-xs text-ink-3">Aucun signalement pour le moment.</div>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => {
            const date = new Date(r.created_at);
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.category ? (
                    <Badge variant="muted" className="text-[10px]">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </Badge>
                  ) : null}
                  <Badge className={`text-[10px] ${STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  <span className="text-[10px] text-ink-3 ml-auto">
                    {date.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "short", year: "numeric" })}{" "}
                    {date.toLocaleTimeString("fr-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-sm text-ink mt-2 whitespace-pre-wrap break-words">{r.message}</div>
                {r.status !== "handled" ? (
                  <div className="mt-2">
                    <MarkReportHandledButton reportId={r.id} employeeId={employeeId} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
