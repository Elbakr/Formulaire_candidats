// Karim 2026-05-31 : onglet "Mails envoyés" côté RH - liste de tous les mails
// archivés dans outbound_mails (contrats, payslips, info_request, etc.).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Mail, Paperclip, AlertCircle, Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS, SOURCE_COLORS, type MailSource } from "@/lib/outbound-mail-log";
import { MailsFilters } from "./mails-filters";

export const dynamic = "force-dynamic";

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

export default async function RhMailsPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data } = await admin
    .from("outbound_mails")
    .select(`
      id, sent_at, recipient_email, recipient_name, subject, body, source,
      source_ref, status, error_message, attachments, employee_id,
      employee:employees(id, full_name)
    `)
    .order("sent_at", { ascending: false })
    .limit(500);

  const mails = (data ?? []) as unknown as OutboundMail[];

  // Stats par source
  const byCsource = new Map<string, number>();
  let failedCount = 0;
  for (const m of mails) {
    byCsource.set(m.source, (byCsource.get(m.source) ?? 0) + 1);
    if (m.status === "failed") failedCount++;
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="w-6 h-6" />
            Mails envoyés
          </h1>
          <p className="text-sm text-muted-foreground">
            Journal centralisé des mails envoyés par la plateforme (contrats, fiches de paie,
            demandes d&apos;infos, magic links, etc.). Tous archivés depuis hr@caftanfactory.com.
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link href="/rh/mails/new"><Plus className="w-4 h-4 mr-1" /> Nouveau mail</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{mails.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Envoyés réussis</div>
          <div className="text-2xl font-bold text-green-700">{mails.length - failedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Échecs</div>
          <div className="text-2xl font-bold text-red-700">{failedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Sources distinctes</div>
          <div className="text-2xl font-bold">{byCsource.size}</div>
        </Card>
      </div>

      <MailsFilters allMails={mails} sourcesAvailable={Array.from(byCsource.keys())} />
    </div>
  );
}
