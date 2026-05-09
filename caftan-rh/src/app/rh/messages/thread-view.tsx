"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Paperclip, Send } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmailSendDialog } from "@/components/email-send-dialog";
import { useRealtime } from "@/hooks/use-realtime";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Att = { path: string; filename: string; mime_type: string; size: number };
type Message = {
  id: string;
  application_id: string;
  direction: string;
  subject: string | null;
  body: string;
  from_email: string | null;
  from_name: string | null;
  attachments: Att[] | null;
  created_at: string;
};

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

type Thread = {
  id: string;
  application_id: string;
  subject_root: string | null;
  candidate: { id: string; full_name: string; email: string } | null;
};

export function ThreadView({
  thread,
  messages,
  templates,
  attachmentsMap,
}: {
  thread: Thread;
  messages: Message[];
  templates: Template[];
  attachmentsMap: Record<string, Record<string, string>>;
}) {
  const router = useRouter();
  const [composerMode, setComposerMode] = useState<"template" | "freeform">("template");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // Refresh on inbound updates
  useRealtime("messages", () => router.refresh(), `application_id=eq.${thread.application_id}`);
  useRealtime("inbound_emails", () => router.refresh());

  const candidateName = thread.candidate?.full_name ?? "—";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-line p-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">
            {thread.subject_root || "(sans sujet)"}
          </div>
          <div className="text-[11px] text-ink-3">
            avec <span className="font-semibold">{candidateName}</span>
            {thread.candidate?.email ? <span className="ml-1">· {thread.candidate.email}</span> : null}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-2/30">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-ink-3 py-8">
            Aucun message dans ce fil pour l'instant.
          </div>
        ) : (
          messages.map((m) => {
            const isOut = m.direction === "outbound";
            const attUrls = attachmentsMap[m.id] ?? {};
            const senderLabel = isOut
              ? "Vous"
              : m.from_name
                ? `${m.from_name}${m.from_email ? ` <${m.from_email}>` : ""}`
                : (m.from_email ?? candidateName);
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-md border bg-surface p-3 shadow-sm max-w-[88%]",
                  isOut ? "border-info-light/50 ml-auto" : "border-success-light/60 mr-auto",
                )}
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <NameAvatar
                    name={isOut ? "Vous" : (m.from_name ?? candidateName)}
                    className="h-7 w-7"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold truncate">{senderLabel}</span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider font-bold rounded-full px-1.5 py-[1px]",
                          isOut ? "bg-info-light text-info" : "bg-success-light text-success",
                        )}
                      >
                        {isOut ? "→ candidat" : "← candidat"}
                      </span>
                      <span className="text-[10px] text-ink-3 ml-auto">
                        {formatDateTime(m.created_at)}
                      </span>
                    </div>
                    {m.subject ? (
                      <div className="text-[11px] font-semibold text-ink-2 mt-0.5">{m.subject}</div>
                    ) : null}
                  </div>
                </div>
                <div
                  className="text-xs text-ink-2 whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: linkifyOrPassthrough(m.body) }}
                />
                {m.attachments && m.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => {
                      const url = attUrls[a.path];
                      const node = (
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] border border-line hover:bg-gold-light/40 transition-colors">
                          <Paperclip className="h-3 w-3" />
                          <span className="font-semibold">{a.filename}</span>
                          <span className="text-ink-3">· {formatBytes(a.size)}</span>
                        </span>
                      );
                      return url ? (
                        <a
                          key={a.path}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={a.filename}
                          className="no-underline"
                        >
                          {node}
                        </a>
                      ) : (
                        <span key={a.path} className="opacity-60">{node}</span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-line p-3 bg-surface">
        <Tabs value={composerMode} onValueChange={(v) => setComposerMode(v as "template" | "freeform")}>
          <TabsList>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="freeform">Libre</TabsTrigger>
          </TabsList>
          <TabsContent value="template">
            <div className="pt-2">
              <Button
                variant="gold"
                size="sm"
                onClick={() => setTemplateDialogOpen(true)}
                disabled={!thread.application_id}
              >
                <Mail className="h-3.5 w-3.5" /> Choisir un template…
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="freeform">
            <FreeformComposer
              applicationId={thread.application_id}
              candidateName={candidateName}
              templates={templates}
            />
          </TabsContent>
        </Tabs>
      </div>

      <EmailSendDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        applicationIds={[thread.application_id]}
        recipientPreview={candidateName}
        templates={templates}
        initialMode="template"
      />
    </div>
  );
}

/**
 * Inline freeform composer that opens the EmailSendDialog in freeform mode
 * with subject + body pre-filled.
 */
function FreeformComposer({
  applicationId,
  candidateName,
  templates,
}: {
  applicationId: string;
  candidateName: string;
  templates: Template[];
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);

  function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setOpen(true);
  }

  return (
    <div className="space-y-2 pt-2">
      <div>
        <Label htmlFor="thread-subject" className="text-[10px]">Sujet</Label>
        <Input
          id="thread-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet de l'email"
        />
      </div>
      <div>
        <Label htmlFor="thread-body" className="text-[10px]">Corps</Label>
        <Textarea
          id="thread-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bonjour…"
        />
      </div>
      <div className="flex justify-end">
        <Button variant="gold" size="sm" disabled={!subject.trim() || !body.trim()} onClick={handleSend}>
          <Send className="h-3.5 w-3.5" /> Envoyer
        </Button>
      </div>

      <EmailSendDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            // reset after sending
            setSubject("");
            setBody("");
          }
        }}
        applicationIds={[applicationId]}
        recipientPreview={candidateName}
        templates={templates}
        initialMode="freeform"
        initialSubject={subject}
        initialBody={body}
      />
    </div>
  );
}

function linkifyOrPassthrough(body: string): string {
  // Treat the body as already-rendered HTML if it contains HTML tags, otherwise
  // escape + linkify URLs and convert newlines to <br>.
  const looksHtml = /<\/?[a-z][^>]*>/i.test(body);
  if (looksHtml) return body;
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, "<br>");
  return esc;
}

function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
