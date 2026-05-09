import Link from "next/link";
import { Mail, Inbox, AlertCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ThreadView } from "./thread-view";
import { signedAttachmentsForMessages } from "./signed-attachments";

type SearchParams = { thread?: string };

type ThreadRow = {
  id: string;
  application_id: string | null;
  subject_root: string | null;
  last_message_at: string | null;
  message_count: number | null;
  application: {
    id: string;
    status: string;
    candidate: { id: string; full_name: string; email: string } | null;
    job: { title: string } | null;
  } | null;
};

type MessageRow = {
  id: string;
  application_id: string;
  direction: string;
  subject: string | null;
  body: string;
  from_email: string | null;
  from_name: string | null;
  attachments: Array<{ path: string; filename: string; mime_type: string; size: number }> | null;
  created_at: string;
};

export default async function RhMessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await searchParams;
  const supabase = await createClient();

  // Threads (top 80)
  const { data: threadsRaw } = await supabase
    .from("email_threads")
    .select(
      `id, application_id, subject_root, last_message_at, message_count,
       application:applications(id, status,
         candidate:candidates(id, full_name, email),
         job:jobs(title))`,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);
  const threads = (threadsRaw ?? []) as unknown as ThreadRow[];

  // Pending unmatched count
  const { count: unmatchedCount } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "unmatched");

  // Selected thread
  let selected: ThreadRow | null = null;
  let messages: MessageRow[] = [];
  let templates: Array<{
    slug: string;
    label: string;
    subject: string;
    body_html: string;
    needs_dates: boolean;
    needs_times: boolean;
  }> = [];
  let candidateNotes: Array<{ id: string; body: string; created_at: string }> = [];
  let signedAttachmentsMap: Record<string, Record<string, string>> = {};

  if (sp.thread) {
    const found = threads.find((t) => t.id === sp.thread) ?? null;
    selected = found;
    if (selected?.application_id) {
      const [{ data: msgs }, { data: tmpls }, { data: notes }] = await Promise.all([
        supabase
          .from("messages")
          .select(
            "id, application_id, direction, subject, body, from_email, from_name, attachments, created_at",
          )
          .eq("application_id", selected.application_id)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("email_templates")
          .select("slug, label, subject, body_html, needs_dates, needs_times")
          .eq("is_active", true)
          .order("label"),
        supabase
          .from("notes")
          .select("id, body, created_at")
          .eq("application_id", selected.application_id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      messages = (msgs ?? []) as unknown as MessageRow[];
      templates = (tmpls ?? []) as never;
      candidateNotes = (notes ?? []) as unknown as Array<{ id: string; body: string; created_at: string }>;
      signedAttachmentsMap = await signedAttachmentsForMessages(messages);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Messagerie</h1>
          <p className="text-sm text-ink-2">
            {threads.length} fil{threads.length > 1 ? "s" : ""} · échanges entrants & sortants par candidat.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/rh/messages/unmatched"
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold border transition-colors",
              unmatchedCount && unmatchedCount > 0
                ? "bg-warn-light text-warn border-warn-light hover:bg-warn hover:text-white"
                : "border-line text-ink-2 hover:bg-surface-2",
            )}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            À attribuer
            {unmatchedCount && unmatchedCount > 0 ? (
              <span className="rounded-full bg-warn px-2 py-[1px] text-[10px] font-bold text-white">
                {unmatchedCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_300px] gap-3 h-[calc(100vh-240px)] min-h-[500px]">
        {/* Left : thread list */}
        <Card className="overflow-y-auto">
          {threads.length === 0 ? (
            <div className="p-6 text-center">
              <Inbox className="h-8 w-8 text-ink-3 mx-auto mb-2" />
              <p className="text-xs text-ink-3">Aucun fil pour l'instant.</p>
              <p className="text-[11px] text-ink-3 mt-1">
                Les threads apparaîtront ici dès le premier email envoyé ou reçu.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {threads.map((t) => {
                const cand = t.application?.candidate;
                const isActive = sp.thread === t.id;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/rh/messages?thread=${t.id}`}
                      className={cn(
                        "block p-3 hover:bg-surface-2 transition-colors",
                        isActive && "bg-gold-light/40",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <NameAvatar name={cand?.full_name ?? "?"} className="h-8 w-8" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs truncate">
                              {cand?.full_name ?? "—"}
                            </span>
                            {t.message_count && t.message_count > 0 ? (
                              <span className="text-[10px] text-ink-3 font-mono">
                                {t.message_count}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-ink-2 truncate">
                            {t.subject_root || "(sans sujet)"}
                          </div>
                          {t.last_message_at ? (
                            <div className="text-[10px] text-ink-3 mt-0.5">
                              {formatDateTime(t.last_message_at)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Center : thread messages + composer */}
        <Card className="overflow-hidden flex flex-col">
          {selected && selected.application_id ? (
            <ThreadView
              thread={{
                id: selected.id,
                application_id: selected.application_id,
                subject_root: selected.subject_root,
                candidate: selected.application?.candidate ?? null,
              }}
              messages={messages}
              templates={templates}
              attachmentsMap={signedAttachmentsMap}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <div>
                <Mail className="h-10 w-10 text-ink-3 mx-auto mb-3" />
                <p className="text-sm text-ink-2">Sélectionne un fil pour voir l'échange.</p>
                <p className="text-xs text-ink-3 mt-1">
                  Les emails entrants apparaissent automatiquement, attachés au candidat.
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Right : context panel */}
        <Card className="hidden xl:flex flex-col overflow-y-auto">
          {selected?.application ? (
            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                  Candidat
                </div>
                <div className="font-bold text-sm">{selected.application.candidate?.full_name ?? "—"}</div>
                {selected.application.candidate?.email ? (
                  <div className="text-xs text-ink-2 break-all">
                    {selected.application.candidate.email}
                  </div>
                ) : null}
                {selected.application.job?.title ? (
                  <div className="text-xs text-ink-3 mt-1">{selected.application.job.title}</div>
                ) : null}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                  Pipeline
                </div>
                <span className="inline-block rounded-full bg-info-light text-info text-[10px] font-bold px-2 py-0.5">
                  {selected.application.status}
                </span>
              </div>
              <div>
                <Link
                  href={`/rh/candidates/${selected.application_id}`}
                  className="text-xs font-bold text-gold-dark hover:underline"
                >
                  Voir la fiche complète →
                </Link>
              </div>
              {candidateNotes.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-1.5">
                    Dernières notes
                  </div>
                  <ul className="space-y-2">
                    {candidateNotes.map((n) => (
                      <li key={n.id} className="text-[11px] rounded bg-surface-2 p-2">
                        <div className="text-[10px] text-ink-3 mb-0.5">
                          {formatDateTime(n.created_at)}
                        </div>
                        <div className="text-ink-2 whitespace-pre-wrap line-clamp-4">{n.body}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4 text-xs text-ink-3 text-center">
              Sélectionne un fil pour voir le contexte du candidat.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
