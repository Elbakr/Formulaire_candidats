// Karim 2026-05-31 : section "Mails" sur fiche employee - liste les mails
// envoyés à cet employee + bouton "Nouveau mail".

import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Mail, Paperclip, AlertCircle, Plus } from "lucide-react";
import { SOURCE_LABELS, SOURCE_COLORS, type MailSource } from "@/lib/outbound-mail-types";

export async function EmployeeMailsSection({ employeeId }: { employeeId: string }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("outbound_mails")
    .select("id, sent_at, subject, source, status, attachments, recipient_email")
    .eq("employee_id", employeeId)
    .order("sent_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string;
    sent_at: string;
    subject: string;
    source: MailSource;
    status: string;
    attachments: Array<{ name: string; url: string }>;
    recipient_email: string;
  };
  const rows = (data ?? []) as Row[];

  return (
    <Card id="mails" className="overflow-hidden">
      <div className="p-4 border-b border-line flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Mail className="w-4 h-4" /> Mails envoyés ({rows.length})
          </h2>
          <p className="text-[10px] text-ink-3 mt-0.5">
            Historique des mails envoyés à cet employé depuis CaftanRH (hr@caftanfactory.com)
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/rh/mails/new?to=${employeeId}`}>
            <Plus className="w-3.5 h-3.5" /> Nouveau mail
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Aucun mail envoyé à cet employé pour le moment.
        </div>
      ) : (
        <div className="divide-y max-h-96 overflow-y-auto">
          {rows.map((m) => {
            const date = new Date(m.sent_at);
            const sourceColor = SOURCE_COLORS[m.source] ?? "bg-gray-100 text-gray-800";
            const sourceLabel = SOURCE_LABELS[m.source] ?? m.source;
            return (
              <div key={m.id} className="p-3 hover:bg-muted/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold truncate flex-1">{m.subject}</span>
                  <Badge className={`text-[10px] ${sourceColor}`}>{sourceLabel}</Badge>
                  {m.status === "failed" && (
                    <Badge className="bg-red-100 text-red-800 text-[10px] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                    </Badge>
                  )}
                  {m.attachments && m.attachments.length > 0 && (
                    <Badge variant="muted" className="text-[10px] flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> {m.attachments.length}
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-ink-3 mt-0.5">
                  → {m.recipient_email} ·{" "}
                  {date.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "short", year: "numeric" })}{" "}
                  {date.toLocaleTimeString("fr-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
