import Link from "next/link";
import { Mail } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";

export default async function RhMessagesPage() {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("messages")
    .select(`id, subject, body, direction, created_at,
             application:applications(id, candidate:candidates(id, full_name, email),
                                       job:jobs(title))`)
    .order("created_at", { ascending: false })
    .limit(100);

  const messages = (data ?? []) as unknown as Array<{
    id: string;
    subject: string | null;
    body: string;
    direction: string;
    created_at: string;
    application: {
      id: string;
      candidate: { id: string; full_name: string; email: string } | null;
      job: { title: string } | null;
    } | null;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messagerie</h1>
        <p className="text-sm text-ink-2">Échanges email avec les candidats ({messages.length} derniers).</p>
      </div>
      {messages.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <Mail className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Aucun message envoyé pour l'instant.</p>
            <p className="text-xs text-ink-3 mt-1">
              Les emails automatiques (accusés, convocations, refus, embauches) apparaîtront ici.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const cand = m.application?.candidate;
            return (
              <Card key={m.id}>
                <Link
                  href={m.application ? `/rh/candidates/${m.application.id}` : "#"}
                  className="block p-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <NameAvatar name={cand?.full_name ?? "?"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{cand?.full_name ?? "—"}</span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${m.direction === "outbound" ? "bg-info-light text-info" : "bg-success-light text-success"}`}>
                          {m.direction === "outbound" ? "→ candidat" : "← candidat"}
                        </span>
                        <span className="text-[11px] text-ink-3">{formatDateTime(m.created_at)}</span>
                      </div>
                      {m.subject ? <div className="text-xs font-semibold mt-0.5 truncate">{m.subject}</div> : null}
                      <div className="text-xs text-ink-3 mt-0.5 truncate">{m.body.slice(0, 140)}</div>
                    </div>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
