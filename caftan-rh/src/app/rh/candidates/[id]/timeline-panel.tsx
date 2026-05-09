import { StickyNote, Mail, MailOpen, Calendar as CalendarIcon, Paperclip, Sparkles, RefreshCw, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils";

type EventType =
  | "note"
  | "message_outbound"
  | "message_inbound"
  | "interview"
  | "document"
  | "application_created"
  | "status_changed";

type TimelineItem = {
  id: string;
  type: EventType;
  when: string; // ISO
  headline: string;
  body?: string | null;
  actor?: string | null;
  meta?: string | null;
  isPrivate?: boolean;
};

type ActivityRow = {
  id: string;
  kind: string | null;
  description: string | null;
  actor_label: string | null;
  created_at: string;
  data: Record<string, unknown> | null;
};

type ProfileRef = { id: string; full_name: string | null } | null;

const VISUALS: Record<EventType, { Icon: typeof StickyNote; dot: string; chip: string; label: string }> = {
  note: {
    Icon: StickyNote,
    dot: "bg-violet",
    chip: "bg-violet-light text-violet",
    label: "Note",
  },
  message_outbound: {
    Icon: Mail,
    dot: "bg-gold",
    chip: "bg-gold-light text-gold-dark",
    label: "Email envoye",
  },
  message_inbound: {
    Icon: MailOpen,
    dot: "bg-info",
    chip: "bg-info-light text-info",
    label: "Email recu",
  },
  interview: {
    Icon: CalendarIcon,
    dot: "bg-warn",
    chip: "bg-warn-light text-warn",
    label: "Entretien",
  },
  document: {
    Icon: Paperclip,
    dot: "bg-ink-2",
    chip: "bg-surface-2 text-ink-2",
    label: "Document",
  },
  application_created: {
    Icon: Sparkles,
    dot: "bg-success",
    chip: "bg-success-light text-success",
    label: "Candidature",
  },
  status_changed: {
    Icon: RefreshCw,
    dot: "bg-info",
    chip: "bg-info-light text-info",
    label: "Statut",
  },
};

function dayKey(iso: string) {
  // group by local YYYY-MM-DD
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(iso: string) {
  const today = new Date();
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, yesterday)) return "Hier";
  return formatDate(iso, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function summarizeBody(body: string | null | undefined, limit = 240) {
  if (!body) return null;
  const trimmed = body.trim();
  if (trimmed.length <= limit) return { short: trimmed, full: null as string | null };
  return { short: trimmed.slice(0, limit) + "...", full: trimmed };
}

export async function TimelinePanel({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();

  const [appRes, notesRes, messagesRes, interviewsRes, docsRes] = await Promise.all([
    supabase
      .from("applications")
      .select("id, created_at, status")
      .eq("id", applicationId)
      .single(),
    supabase
      .from("notes")
      .select("id, body, is_private, created_at, author:profiles(id, full_name)")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, subject, body, direction, created_at, sender:profiles(id, full_name)")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("interviews")
      .select("id, scheduled_at, type, status, location, meeting_url, created_at, interviewer_profile:profiles(id, full_name)")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, file_name, kind, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
  ]);

  // activity_log is optional - the table may not exist yet.
  let activity: ActivityRow[] = [];
  try {
    const { data, error } = await supabase
      .from("activity_log" as never)
      .select("id, kind, description, actor_label, created_at, data")
      .eq("target_type", "application")
      .eq("target_id", applicationId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      activity = data as unknown as ActivityRow[];
    }
  } catch {
    // table doesn't exist yet — ignore
  }

  const items: TimelineItem[] = [];

  // application_created (synthesized)
  if (appRes.data?.created_at) {
    items.push({
      id: `app-${appRes.data.id}`,
      type: "application_created",
      when: appRes.data.created_at,
      headline: "Candidature recue",
      body: null,
    });
  }

  // notes
  for (const n of (notesRes.data ?? []) as unknown as Array<{
    id: string;
    body: string;
    is_private: boolean;
    created_at: string;
    author: ProfileRef;
  }>) {
    items.push({
      id: `note-${n.id}`,
      type: "note",
      when: n.created_at,
      headline: "Note ajoutee",
      body: n.body,
      actor: n.author?.full_name ?? null,
      isPrivate: n.is_private,
    });
  }

  // messages
  for (const m of (messagesRes.data ?? []) as unknown as Array<{
    id: string;
    subject: string | null;
    body: string;
    direction: "outbound" | "inbound";
    created_at: string;
    sender: ProfileRef;
  }>) {
    items.push({
      id: `msg-${m.id}`,
      type: m.direction === "outbound" ? "message_outbound" : "message_inbound",
      when: m.created_at,
      headline: m.subject?.trim() || (m.direction === "outbound" ? "Email envoye au candidat" : "Email recu du candidat"),
      body: m.body,
      actor: m.sender?.full_name ?? null,
    });
  }

  // interviews
  for (const iv of (interviewsRes.data ?? []) as unknown as Array<{
    id: string;
    scheduled_at: string;
    type: "phone" | "video" | "onsite";
    status: string;
    location: string | null;
    meeting_url: string | null;
    created_at: string;
    interviewer_profile: ProfileRef;
  }>) {
    const typeLabel = iv.type === "phone" ? "Telephone" : iv.type === "video" ? "Visio" : "Sur place";
    items.push({
      id: `iv-${iv.id}`,
      type: "interview",
      when: iv.created_at,
      headline: `Entretien planifie - ${typeLabel}`,
      body: null,
      actor: iv.interviewer_profile?.full_name ?? null,
      meta: `${formatDateTime(iv.scheduled_at)}${iv.location ? ` - ${iv.location}` : iv.meeting_url ? ` - ${iv.meeting_url}` : ""} - ${iv.status}`,
    });
  }

  // documents
  for (const d of (docsRes.data ?? []) as Array<{
    id: string;
    file_name: string;
    kind: string | null;
    created_at: string;
  }>) {
    items.push({
      id: `doc-${d.id}`,
      type: "document",
      when: d.created_at,
      headline: `Document ajoute: ${d.file_name}`,
      body: null,
      meta: d.kind ? d.kind.toUpperCase() : null,
    });
  }

  // activity_log (status changes etc.)
  for (const a of activity) {
    const kind = (a.kind ?? "").toLowerCase();
    if (kind === "status_changed" || kind === "status_change") {
      const data = (a.data ?? {}) as { from?: string; to?: string };
      const transition =
        data.from && data.to ? `${data.from} -> ${data.to}` : a.description ?? "Statut modifie";
      items.push({
        id: `act-${a.id}`,
        type: "status_changed",
        when: a.created_at,
        headline: "Statut modifie",
        body: null,
        actor: a.actor_label ?? null,
        meta: transition,
      });
    }
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  // Group by day
  const groups = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const k = dayKey(it.when);
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }

  if (items.length === 0) {
    return (
      <Card>
        <div className="p-6 text-sm text-ink-3">Aucun evenement pour cette candidature.</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4">
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, dayItems]) => (
            <section key={day}>
              <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm py-1.5 mb-2 border-b border-line">
                <h3 className="text-[11px] uppercase tracking-wider font-bold text-ink-3">
                  {dayLabel(dayItems[0].when)}
                </h3>
              </div>
              <ul className="relative pl-6">
                <span
                  aria-hidden
                  className="absolute left-2 top-1 bottom-1 w-px bg-line"
                />
                {dayItems.map((it) => {
                  const v = VISUALS[it.type];
                  const summary = summarizeBody(it.body);
                  return (
                    <li key={it.id} className="relative pb-4 last:pb-0">
                      <span
                        aria-hidden
                        className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-surface ${v.dot}`}
                      />
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${v.chip}`}
                            >
                              <v.Icon className="h-3 w-3" />
                              {v.label}
                            </span>
                            <span className="text-sm font-semibold text-ink">{it.headline}</span>
                            {it.isPrivate ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-warn">
                                <Lock className="h-3 w-3" /> privee
                              </span>
                            ) : null}
                          </div>
                          {it.meta ? (
                            <div className="text-xs text-ink-2 mt-1">{it.meta}</div>
                          ) : null}
                          {summary ? (
                            <div className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">
                              {summary.full ? (
                                <details className="group">
                                  <summary className="cursor-pointer list-none">
                                    <span className="group-open:hidden">{summary.short}</span>
                                    <span className="hidden group-open:inline whitespace-pre-wrap">{summary.full}</span>
                                    <span className="ml-1 text-[11px] text-gold-dark group-open:hidden">Voir plus</span>
                                    <span className="ml-1 text-[11px] text-gold-dark hidden group-open:inline">Reduire</span>
                                  </summary>
                                </details>
                              ) : (
                                <p>{summary.short}</p>
                              )}
                            </div>
                          ) : null}
                          {it.actor ? (
                            <div className="text-[11px] text-ink-3 mt-1">par {it.actor}</div>
                          ) : null}
                        </div>
                        <time
                          className="text-[11px] text-ink-3 whitespace-nowrap shrink-0"
                          dateTime={it.when}
                          title={formatDateTime(it.when)}
                        >
                          {formatDateTime(it.when)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Card>
  );
}
