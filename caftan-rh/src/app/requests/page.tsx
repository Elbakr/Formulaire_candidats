import Link from "next/link";

export const dynamic = "force-dynamic";

import {
  ShoppingBag,
  ClipboardList,
  Clock,
  Package,
  Wrench,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { RequestsActions } from "./requests-actions";

const KIND_ICON: Record<string, typeof ShoppingBag> = {
  product: ShoppingBag,
  work_item: ClipboardList,
  time_change: Clock,
  supplies: Package,
  maintenance: Wrench,
  other: MessageSquare,
};

const KIND_LABEL: Record<string, string> = {
  product: "Produit",
  work_item: "Tâche",
  time_change: "Horaire",
  supplies: "Matériel",
  maintenance: "Maintenance",
  other: "Autre",
};

const STATUS_ORDER = ["open", "in_progress", "done", "rejected"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Ouvertes",
  in_progress: "En cours",
  done: "Faites",
  rejected: "Refusées",
};

export default async function RequestsPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: rowsRaw } = await supabase
    .from("chat_requests")
    .select(
      `id, kind, title, body, status, urgency, quantity, external_ref,
       created_at, resolved_at, resolution_note, room_id,
       author:profiles!author_profile_id(full_name),
       room:chat_rooms(id, name, kind, site:sites(code, name, color))`,
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  type Row = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    status: string;
    urgency: string;
    quantity: number | null;
    external_ref: string | null;
    created_at: string;
    resolved_at: string | null;
    resolution_note: string | null;
    room_id: string;
    author: { full_name: string | null } | null;
    room: {
      id: string;
      name: string;
      kind: string;
      site: { code: string; name: string; color: string | null } | null;
    } | null;
  };
  const rows = (rowsRaw ?? []) as unknown as Row[];

  const byStatus = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byStatus.get(r.status) ?? [];
    arr.push(r);
    byStatus.set(r.status, arr);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-gold-dark" />
          Demandes équipe
        </h1>
        <p className="text-sm text-ink-2">
          Toutes les demandes émises depuis les chats (produits, matériel,
          tâches, horaires…). Triées par statut puis par date.
        </p>
      </div>

      {STATUS_ORDER.map((s) => {
        const list = byStatus.get(s) ?? [];
        if (list.length === 0 && (s === "done" || s === "rejected")) return null;
        return (
          <section key={s}>
            <h2 className="text-xs uppercase tracking-wider font-bold text-ink-3 mb-1.5">
              {STATUS_LABEL[s]} ({list.length})
            </h2>
            {list.length === 0 ? (
              <Card>
                <div className="p-4 text-sm text-ink-3 italic text-center">
                  Aucune demande {STATUS_LABEL[s].toLowerCase()}.
                </div>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {list.map((r) => {
                  const Icon = KIND_ICON[r.kind] ?? MessageSquare;
                  return (
                    <Card key={r.id}>
                      <div className="p-3 flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{
                            backgroundColor: r.room?.site?.color ?? "#c9a34d",
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                              {KIND_LABEL[r.kind] ?? r.kind}
                            </span>
                            {r.urgency === "urgent" ? (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-px rounded-full bg-danger-light text-danger">
                                Urgent
                              </span>
                            ) : null}
                            <span className="text-[10px] text-ink-3">
                              · {r.author?.full_name ?? "—"}
                              {r.room?.site
                                ? ` · ${r.room.site.code}`
                                : r.room?.name
                                  ? ` · ${r.room.name}`
                                  : ""}
                            </span>
                            <span className="text-[10px] text-ink-3 ml-auto">
                              {new Date(r.created_at).toLocaleString("fr-BE", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="font-bold mt-0.5">{r.title}</div>
                          {r.body ? (
                            <div className="text-xs text-ink-2 mt-0.5 line-clamp-2">
                              {r.body}
                            </div>
                          ) : null}
                          {r.quantity || r.external_ref ? (
                            <div className="text-[11px] text-ink-3 mt-1 flex gap-3">
                              {r.quantity ? (
                                <span>
                                  <strong>Qté :</strong> {r.quantity}
                                </span>
                              ) : null}
                              {r.external_ref ? (
                                <span>
                                  <strong>Réf :</strong> {r.external_ref}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {r.resolution_note ? (
                            <div className="text-[11px] text-ink-3 mt-1 italic">
                              {r.resolution_note}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {r.status === "open" || r.status === "in_progress" ? (
                              <RequestsActions
                                requestId={r.id}
                                status={r.status as "open" | "in_progress"}
                              />
                            ) : null}
                            {r.room ? (
                              <Link
                                href={`/chat/${r.room.id}`}
                                className="text-[11px] text-gold-dark hover:underline inline-flex items-center gap-0.5 ml-auto"
                              >
                                Ouvrir le chat <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
