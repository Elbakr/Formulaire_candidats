import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { UnmatchedList } from "./unmatched-list";

type Inbound = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  attachments: Array<{ path: string; filename: string; mime_type: string; size: number }> | null;
};

type Candidate = {
  id: string;
  full_name: string;
  email: string;
  application_id: string | null;
};

export default async function UnmatchedPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const [{ data: inboundsRaw }, { data: candsRaw }] = await Promise.all([
    supabase
      .from("inbound_emails")
      .select("id, from_email, from_name, subject, body_text, body_html, received_at, attachments")
      .eq("status", "unmatched")
      .order("received_at", { ascending: false })
      .limit(200),
    supabase
      .from("applications")
      .select(
        "id, candidate:candidates(id, full_name, email)",
      )
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const inbounds = (inboundsRaw ?? []) as unknown as Inbound[];

  type AppRow = { id: string; candidate: { id: string; full_name: string; email: string } | null };
  const candidates: Candidate[] = ((candsRaw ?? []) as unknown as AppRow[])
    .filter((a) => a.candidate)
    .map((a) => ({
      id: a.candidate!.id,
      full_name: a.candidate!.full_name,
      email: a.candidate!.email,
      application_id: a.id,
    }));

  // Dedupe by candidate.id (keep newest application_id which comes first due to order)
  const seen = new Set<string>();
  const uniqueCandidates: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniqueCandidates.push(c);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/rh/messages"
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> Messagerie
        </Link>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warn" />
          <h1 className="text-2xl font-bold">Emails à attribuer</h1>
        </div>
        <p className="text-sm text-ink-2">
          Emails entrants non rattachés à un candidat — clique sur "Attribuer" pour relier au bon dossier.
        </p>
      </div>

      {inbounds.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-sm text-ink-2">Aucun email en attente d'attribution.</p>
            <p className="text-xs text-ink-3 mt-1">
              Tous les emails entrants ont été matchés automatiquement.
            </p>
          </div>
        </Card>
      ) : (
        <UnmatchedList
          initialInbounds={inbounds.map((i) => ({
            id: i.id,
            from_email: i.from_email,
            from_name: i.from_name,
            subject: i.subject,
            snippet: extractSnippet(i.body_text, i.body_html),
            received_at: i.received_at,
            received_at_label: formatDateTime(i.received_at),
            attachment_count: i.attachments?.length ?? 0,
          }))}
          candidates={uniqueCandidates}
        />
      )}
    </div>
  );
}

function extractSnippet(text: string | null, html: string | null): string {
  const raw = text ?? (html ? html.replace(/<[^>]+>/g, " ") : "");
  return raw.replace(/\s+/g, " ").trim().slice(0, 220);
}
