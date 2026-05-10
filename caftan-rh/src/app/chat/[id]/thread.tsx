"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ShoppingBag,
  ClipboardList,
  Clock,
  Package,
  Wrench,
  MessageSquare,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Megaphone,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ChatAuthorMenu } from "@/components/chat-author-menu";
import { updateRequestStatusAction } from "../actions";
import { volunteerForAbsenceAction } from "@/app/me/absence/actions";
import {
  acceptReinforcementAction,
  declineReinforcementAction,
} from "@/app/planning/reinforcement/actions";

type Message = {
  id: string;
  room_id: string;
  author_profile_id: string | null;
  body: string;
  attachments?:
    | Array<{
        kind?: string;
        action?: string;
        site_code?: string;
        duration_min?: number | null;
        request_kind?: string;
        urgency?: string;
        priority?: string;
        broadcast_id?: string;
        absence_id?: string;
        request_id?: string;
        site_name?: string | null;
        date?: string;
        start_time?: string;
        end_time?: string;
        position?: string | null;
        expires_at?: string | null;
        decision?: string;
      }>
    | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: { id: string; full_name: string | null; role: string | null } | null;
};

type ChatRequest = {
  id: string;
  source_message_id: string;
  kind: string;
  title: string;
  body: string | null;
  urgency: string;
  status: string;
  quantity: number | null;
  external_ref: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

const KIND_ICON: Record<string, typeof ShoppingBag> = {
  product: ShoppingBag,
  work_item: ClipboardList,
  time_change: Clock,
  supplies: Package,
  maintenance: Wrench,
  other: MessageSquare,
};

const KIND_LABEL: Record<string, string> = {
  product: "Demande produit",
  work_item: "Tâche",
  time_change: "Changement horaire",
  supplies: "Matériel",
  maintenance: "Maintenance",
  other: "Demande",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Ouverte", cls: "bg-warn-light text-warn" },
  in_progress: { label: "En cours", cls: "bg-info-light text-info" },
  done: { label: "Faite", cls: "bg-success-light text-success" },
  rejected: { label: "Refusée", cls: "bg-surface-2 text-ink-3 line-through" },
};

export function ChatThread({
  roomId,
  initialMessages,
  initialRequests = [],
  myProfileId,
  isDirection = false,
}: {
  roomId: string;
  initialMessages: Message[];
  initialRequests?: ChatRequest[];
  myProfileId: string;
  isDirection?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [requests, setRequests] = useState<Map<string, ChatRequest>>(
    () => new Map(initialRequests.map((r) => [r.source_message_id, r])),
  );
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Realtime — messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const m = payload.new as Message;
          if (m.deleted_at) return;
          setMessages((prev) => {
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
          if (!m.author) {
            const { data } = await supabase
              .from("profiles")
              .select("id, full_name, role")
              .eq("id", m.author_profile_id ?? "")
              .maybeSingle();
            if (data) {
              setMessages((prev) =>
                prev.map((p) =>
                  p.id === m.id
                    ? { ...p, author: data as Message["author"] }
                    : p,
                ),
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.map((p) =>
              p.id === m.id
                ? { ...p, body: m.body, edited_at: m.edited_at, deleted_at: m.deleted_at }
                : p,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_requests",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const r = payload.new as ChatRequest | null;
          if (!r) return;
          setRequests((prev) => {
            const next = new Map(prev);
            next.set(r.source_message_id, r);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto scroll-smooth-touch p-3 space-y-1.5">
      {messages.length === 0 ? (
        <div className="text-center text-ink-3 text-sm italic py-10">
          Aucun message. Lance la discussion 👇
        </div>
      ) : (
        messages.map((m, i) => {
          const mine = m.author_profile_id === myProfileId;
          const prev = messages[i - 1];
          const sameAuthor =
            prev &&
            prev.author_profile_id === m.author_profile_id &&
            new Date(m.created_at).getTime() -
              new Date(prev.created_at).getTime() <
              5 * 60 * 1000;

          // Présence (clock-in/out) — rendu système discret centré
          const presence = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "presence_event")
            : null;
          if (presence) {
            return (
              <div key={m.id} className="my-2 text-center">
                <span className="inline-block text-[11px] italic text-ink-3 bg-surface-2/50 rounded-full px-2.5 py-0.5">
                  {m.body}
                  <span className="ml-1.5 opacity-70 not-italic">
                    {new Date(m.created_at).toLocaleTimeString("fr-BE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </div>
            );
          }

          // Annonce broadcast — rendu carte spéciale "📢 Direction"
          const broadcast = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "broadcast")
            : null;
          if (broadcast) {
            return (
              <BroadcastCard
                key={m.id}
                message={m}
                priority={broadcast.priority ?? "normal"}
              />
            );
          }

          // Appel à couverture pour absence imprévue.
          const absenceCall = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "absence_call")
            : null;
          if (absenceCall && absenceCall.absence_id) {
            return (
              <AbsenceCallCard
                key={m.id}
                message={m}
                absenceId={absenceCall.absence_id}
                authorIsMe={m.author_profile_id === myProfileId}
              />
            );
          }

          // Confirmation de couverture.
          const absenceCovered = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "absence_covered")
            : null;
          if (absenceCovered) {
            return (
              <div key={m.id} className="my-2 text-center">
                <span className="inline-block text-[11px] font-semibold text-success bg-success-light rounded-full px-2.5 py-0.5">
                  {m.body}
                </span>
              </div>
            );
          }

          // Proposition de renfort — carte avec boutons OUI/NON
          const reinfProposal = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "reinforcement_proposal")
            : null;
          if (reinfProposal && reinfProposal.request_id) {
            return (
              <ReinforcementProposalCard
                key={m.id}
                message={m}
                requestId={reinfProposal.request_id as string}
                siteName={(reinfProposal.site_name as string | null) ?? null}
                date={reinfProposal.date as string}
                startTime={reinfProposal.start_time as string}
                endTime={reinfProposal.end_time as string}
                position={(reinfProposal.position as string | null) ?? null}
                expiresAt={(reinfProposal.expires_at as string | null) ?? null}
                authorIsMe={m.author_profile_id === myProfileId}
                myProfileId={myProfileId}
              />
            );
          }

          // Confirmation de réponse renfort (pour info)
          const reinfReply = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "reinforcement_reply")
            : null;
          if (reinfReply) {
            const decision = (reinfReply.decision as string) ?? "responded";
            const cls =
              decision === "accepted"
                ? "text-success bg-success-light"
                : "text-danger bg-danger-light";
            return (
              <div key={m.id} className="my-2 text-center">
                <span className={`inline-block text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${cls}`}>
                  {m.body}
                </span>
              </div>
            );
          }

          // Demande spécifique — rendu carte
          const isRequest = Array.isArray(m.attachments)
            ? m.attachments.find((a) => a?.kind === "chat_request")
            : null;
          if (isRequest) {
            const req = requests.get(m.id);
            return (
              <RequestCard
                key={m.id}
                message={m}
                request={req}
                authorName={m.author?.full_name ?? "—"}
                mine={mine}
                isDirection={isDirection}
              />
            );
          }

          return (
            <div
              key={m.id}
              className={`flex gap-2 ${mine ? "flex-row-reverse" : ""} ${
                sameAuthor ? "mt-0.5" : "mt-2"
              }`}
            >
              {!mine && !sameAuthor ? (
                <div className="mt-1">
                  <ChatAuthorMenu
                    authorProfileId={m.author_profile_id}
                    authorName={m.author?.full_name ?? "?"}
                    className="h-7 w-7 text-[10px]"
                  />
                </div>
              ) : (
                !mine && <div className="w-7 shrink-0" />
              )}
              <div className={`max-w-[75%] ${mine ? "items-end" : ""}`}>
                {!sameAuthor && !mine ? (
                  <div className="text-[10px] text-ink-3 font-bold mb-0.5 px-1">
                    {m.author?.full_name ?? "—"}
                    {m.author?.role &&
                    ["admin", "rh", "manager"].includes(m.author.role) ? (
                      <span className="ml-1.5 px-1 py-px rounded bg-gold-light text-gold-dark text-[8px] uppercase">
                        {m.author.role}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={`rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${
                    mine ? "bg-gold text-[#1a1a0d]" : "bg-surface-2 text-ink"
                  }`}
                >
                  {m.body}
                </div>
                <div
                  className={`text-[9px] text-ink-3 mt-0.5 px-1 ${mine ? "text-right" : ""}`}
                >
                  {new Date(m.created_at).toLocaleTimeString("fr-BE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {m.edited_at ? " · modifié" : ""}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function RequestCard({
  message,
  request,
  authorName,
  mine,
  isDirection,
}: {
  message: Message;
  request: ChatRequest | undefined;
  authorName: string;
  mine: boolean;
  isDirection: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const kind = request?.kind ?? message.attachments?.[0]?.request_kind ?? "other";
  const Icon = KIND_ICON[kind] ?? MessageSquare;
  const status = request?.status ?? "open";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.open;
  const urgency = request?.urgency ?? message.attachments?.[0]?.urgency ?? "normal";

  function setStatus(s: "in_progress" | "done" | "rejected") {
    if (!request) return;
    startTransition(async () => {
      const r = await updateRequestStatusAction({
        requestId: request.id,
        status: s,
      });
      if (r.error) toast.error(r.error);
    });
  }

  return (
    <div
      className={`flex gap-2 my-2 ${mine ? "flex-row-reverse" : ""}`}
    >
      {!mine ? (
        <div className="mt-1">
          <ChatAuthorMenu
            authorProfileId={message.author_profile_id}
            authorName={authorName}
            className="h-7 w-7 text-[10px]"
          />
        </div>
      ) : (
        <div className="w-7 shrink-0" />
      )}
      <div className={`max-w-[85%] ${mine ? "items-end" : ""}`}>
        {!mine ? (
          <div className="text-[10px] text-ink-3 font-bold mb-0.5 px-1">
            {authorName}
          </div>
        ) : null}
        <div
          className={`rounded-lg border-2 overflow-hidden ${
            urgency === "urgent" ? "border-danger" : "border-line"
          } bg-canvas`}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2/50 border-b border-line">
            <div className="w-7 h-7 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                {KIND_LABEL[kind] ?? "Demande"}
                {urgency === "urgent" ? (
                  <span className="ml-1.5 text-danger">· URGENT</span>
                ) : null}
              </div>
              <div className="font-bold text-sm truncate">
                {request?.title ?? message.body.split("\n")[0]}
              </div>
            </div>
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          {request?.body ? (
            <div className="px-3 py-2 text-sm whitespace-pre-wrap text-ink-2">
              {request.body}
            </div>
          ) : null}
          {request?.quantity || request?.external_ref ? (
            <div className="px-3 py-1.5 text-xs text-ink-3 border-t border-line bg-surface-2/30 flex flex-wrap gap-3">
              {request.quantity ? (
                <span>
                  <strong>Qté :</strong> {request.quantity}
                </span>
              ) : null}
              {request.external_ref ? (
                <span>
                  <strong>Réf :</strong> {request.external_ref}
                </span>
              ) : null}
            </div>
          ) : null}
          {request?.resolution_note ? (
            <div className="px-3 py-1.5 text-xs text-ink-3 border-t border-line italic">
              Note : {request.resolution_note}
            </div>
          ) : null}
          {isDirection && request && status !== "done" && status !== "rejected" ? (
            <div className="px-3 py-2 border-t border-line flex flex-wrap gap-1">
              {status === "open" ? (
                <button
                  onClick={() => setStatus("in_progress")}
                  disabled={pending}
                  className="text-[11px] px-2 py-1 rounded border border-line hover:bg-info-light text-info inline-flex items-center gap-1"
                >
                  <PlayCircle className="h-3 w-3" /> Prendre en charge
                </button>
              ) : null}
              <button
                onClick={() => setStatus("done")}
                disabled={pending}
                className="text-[11px] px-2 py-1 rounded border border-line hover:bg-success-light text-success inline-flex items-center gap-1"
              >
                <CheckCircle2 className="h-3 w-3" /> Marquer fait
              </button>
              <button
                onClick={() => setStatus("rejected")}
                disabled={pending}
                className="text-[11px] px-2 py-1 rounded border border-line hover:bg-danger-light text-danger inline-flex items-center gap-1"
              >
                <XCircle className="h-3 w-3" /> Refuser
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={`text-[9px] text-ink-3 mt-0.5 px-1 ${mine ? "text-right" : ""}`}
        >
          {new Date(message.created_at).toLocaleTimeString("fr-BE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

function ReinforcementProposalCard({
  message,
  requestId,
  siteName,
  date,
  startTime,
  endTime,
  position,
  expiresAt,
  authorIsMe,
  myProfileId,
}: {
  message: Message;
  requestId: string;
  siteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  position: string | null;
  expiresAt: string | null;
  authorIsMe: boolean;
  myProfileId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"accepted" | "declined" | null>(null);
  // Manager qui a proposé voit la carte en lecture seule. L'employé qui reçoit la proposition voit les boutons.
  const isCandidate = !authorIsMe;
  const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
  const dateFr = new Date(date + "T00:00:00").toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  function accept() {
    if (!confirm("Tu acceptes ce renfort ? Un shift sera créé automatiquement.")) return;
    startTransition(async () => {
      const r = await acceptReinforcementAction(requestId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Renfort accepté. Le shift est ajouté à ton planning.");
        setDecision("accepted");
      }
    });
  }
  function decline() {
    if (!confirm("Tu refuses ce renfort ?")) return;
    startTransition(async () => {
      const r = await declineReinforcementAction(requestId);
      if (r.error) toast.error(r.error);
      else {
        toast.message("Renfort refusé. Le manager peut proposer à un autre.");
        setDecision("declined");
      }
    });
  }

  return (
    <div className="my-2 flex justify-center">
      <div className="max-w-[400px] w-full rounded-lg border-2 border-info bg-info-light/40 overflow-hidden">
        <div className="px-3 py-2 bg-info-light text-info text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          Demande de renfort
        </div>
        <div className="p-3 space-y-1 text-sm">
          <div className="font-bold">{siteName ?? "Site"} — {dateFr}</div>
          <div className="font-mono text-base">
            {startTime} – {endTime}
            {position ? <span className="text-xs text-ink-2 ml-2">· {position}</span> : null}
          </div>
          {expiresAt ? (
            <div className="text-[11px] text-ink-3">
              Réponds avant {new Date(expiresAt).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          ) : null}
        </div>
        {decision === "accepted" ? (
          <div className="px-3 py-2 bg-success-light text-success text-xs font-bold inline-flex items-center gap-1 w-full">
            <CheckCircle2 className="h-3.5 w-3.5" /> Accepté — shift ajouté à ton planning
          </div>
        ) : decision === "declined" ? (
          <div className="px-3 py-2 bg-danger-light text-danger text-xs font-bold inline-flex items-center gap-1 w-full">
            <XCircle className="h-3.5 w-3.5" /> Refusé
          </div>
        ) : isCandidate && !expired ? (
          <div className="grid grid-cols-2 gap-1 p-2 border-t border-line">
            <button
              onClick={accept}
              disabled={pending}
              className="bg-success text-white font-bold rounded-md py-2.5 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-95 transition-transform min-h-[44px]"
            >
              <CheckCircle2 className="h-4 w-4" /> OUI, j'accepte
            </button>
            <button
              onClick={decline}
              disabled={pending}
              className="bg-white border-2 border-danger text-danger font-bold rounded-md py-2.5 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-95 transition-transform min-h-[44px]"
            >
              <XCircle className="h-4 w-4" /> NON
            </button>
          </div>
        ) : expired ? (
          <div className="px-3 py-2 bg-surface-2 text-ink-3 text-xs italic text-center">
            Proposition expirée
          </div>
        ) : (
          <div className="px-3 py-2 bg-surface-2 text-ink-3 text-xs italic text-center">
            En attente de réponse de l'employé
          </div>
        )}
        <div className="px-3 pb-2 text-[9px] text-ink-3 text-right">
          {new Date(message.created_at).toLocaleTimeString("fr-BE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

const BROADCAST_BORDER: Record<string, string> = {
  normal: "border-warn",
  important: "border-warn",
  urgent: "border-danger",
};

const BROADCAST_BG: Record<string, string> = {
  normal: "bg-warn-light/40",
  important: "bg-warn-light/60",
  urgent: "bg-danger-light/50",
};

const BROADCAST_PRIO_LABEL: Record<string, string> = {
  normal: "Normal",
  important: "Important",
  urgent: "URGENT",
};

const BROADCAST_PRIO_COLOR: Record<string, string> = {
  normal: "text-warn",
  important: "text-warn",
  urgent: "text-danger",
};

function AbsenceCallCard({
  message,
  absenceId,
  authorIsMe,
}: {
  message: Message;
  absenceId: string;
  authorIsMe: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function volunteer() {
    if (!confirm("Confirmer que tu prends ce shift ?")) return;
    startTransition(async () => {
      const r = await volunteerForAbsenceAction(absenceId);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Merci, le shift t'est attribué.");
        setDone(true);
      }
    });
  }

  return (
    <div className="my-3">
      <div className="mx-auto max-w-[92%] rounded-lg border-2 border-danger bg-danger-light/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line/60 bg-surface/40">
          <div className="w-7 h-7 rounded-md bg-danger text-white flex items-center justify-center shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-danger">
              🚨 Appel à couverture
            </div>
            <div className="text-sm">{message.body}</div>
          </div>
        </div>
        {!authorIsMe && !done ? (
          <div className="px-3 py-2 border-t border-line/60 flex gap-2">
            <button
              onClick={volunteer}
              disabled={pending}
              className="text-[11px] px-3 py-1.5 rounded border border-success bg-success-light hover:bg-success-light/80 text-success font-bold inline-flex items-center gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Je couvre
            </button>
          </div>
        ) : null}
        {done ? (
          <div className="px-3 py-1.5 text-[11px] text-success border-t border-line/60 italic">
            Tu couvres ce shift. Ton planning est mis à jour.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BroadcastCard({
  message,
  priority,
}: {
  message: Message;
  priority: string;
}) {
  const border = BROADCAST_BORDER[priority] ?? BROADCAST_BORDER.normal;
  const bg = BROADCAST_BG[priority] ?? BROADCAST_BG.normal;
  // Sépare titre / corps : convention "📢 Title\n\nBody"
  const lines = message.body.split("\n");
  const headLine = (lines[0] ?? "").replace(/^📢\s*/, "");
  const rest = lines.slice(1).join("\n").trim();
  return (
    <div className="my-3">
      <div
        className={`mx-auto max-w-[92%] rounded-lg border-2 ${border} ${bg} overflow-hidden`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line/60 bg-surface/40">
          <div className="w-7 h-7 rounded-md bg-gold text-[#1a1a0d] flex items-center justify-center shrink-0">
            <Megaphone className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
              📢 Direction
              <span className={`ml-2 ${BROADCAST_PRIO_COLOR[priority] ?? ""}`}>
                · {BROADCAST_PRIO_LABEL[priority] ?? priority}
              </span>
            </div>
            <div className="font-bold text-sm truncate">{headLine}</div>
          </div>
        </div>
        {rest ? (
          <div className="px-3 py-2 text-sm whitespace-pre-wrap text-ink">
            {rest}
          </div>
        ) : null}
        <div className="px-3 py-1 text-[10px] text-ink-3 border-t border-line/60 bg-surface/30">
          {new Date(message.created_at).toLocaleString("fr-BE", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
