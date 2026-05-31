// Karim 2026-05-31 : page candidat "Mails reçus" - liste des mails que CaftanRH
// lui a envoyés (contrats, fiches paie, demandes infos, magic links, etc.).

import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Paperclip, ExternalLink, Inbox } from "lucide-react";
import { SOURCE_LABELS, SOURCE_COLORS, type MailSource } from "@/lib/outbound-mail-types";

export const dynamic = "force-dynamic";

interface OutboundMail {
  id: string;
  sent_at: string;
  subject: string;
  body: string | null;
  source: MailSource;
  attachments: Array<{ name: string; url: string }>;
  sender_name: string | null;
  from_email: string | null;
}

export default async function MyMailsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  // Karim 2026-05-31 : PostgREST n'accepte pas de sous-SELECT dans in.(...),
  // donc on récupère d'abord les ids employees + candidates liés au profile,
  // puis on construit le filtre OR avec des listes littérales.
  // On match aussi par EMAIL (utile pour tester sans changer de compte : un
  // employee fictif "Karim Elbazi" qui partage l'email admin sera inclus).
  const [{ data: linkedEmp }, { data: linkedCand }, { data: sameMailEmp }, { data: sameMailCand }] = await Promise.all([
    admin.from("employees").select("id").eq("profile_id", user.id),
    admin.from("candidates").select("id").eq("profile_id", user.id),
    user.email
      ? admin.from("employees").select("id").ilike("email", user.email)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    user.email
      ? admin.from("candidates").select("id").ilike("email", user.email)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ]);
  const empIds = Array.from(new Set([...(linkedEmp ?? []), ...(sameMailEmp ?? [])].map((e) => e.id)));
  const candIds = Array.from(new Set([...(linkedCand ?? []), ...(sameMailCand ?? [])].map((c) => c.id)));

  const orParts: string[] = [];
  if (user.email) orParts.push(`recipient_email.eq.${user.email}`);
  if (empIds.length > 0) orParts.push(`employee_id.in.(${empIds.join(",")})`);
  if (candIds.length > 0) orParts.push(`candidate_id.in.(${candIds.join(",")})`);

  let query = admin
    .from("outbound_mails")
    .select("id, sent_at, subject, body, source, attachments, sender_name, from_email")
    .order("sent_at", { ascending: false })
    .limit(200);
  if (orParts.length > 0) query = query.or(orParts.join(","));

  const { data, error } = await query;
  if (error) console.warn("[me/mails] query error:", error.message);
  const mails = (data ?? []) as OutboundMail[];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6" />
          Mails reçus
        </h1>
        <p className="text-sm text-muted-foreground">
          Tous les mails que CaftanRH t&apos;a envoyés depuis hr@caftanfactory.com.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        {mails.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun mail reçu pour le moment.
          </div>
        )}
        <div className="divide-y">
          {mails.map((m) => {
            const date = new Date(m.sent_at);
            const sourceColor = SOURCE_COLORS[m.source] ?? "bg-gray-100 text-gray-800";
            const sourceLabel = SOURCE_LABELS[m.source] ?? m.source;
            return (
              <div key={m.id} className="p-4 hover:bg-muted/20">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 mt-0.5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{m.subject}</span>
                      <Badge className={`text-[10px] ${sourceColor}`}>{sourceLabel}</Badge>
                    </div>
                    <div className="text-xs text-ink-3 mb-2">
                      De : <span className="font-medium">{m.sender_name ?? "CaftanRH"}</span>{" "}
                      <span className="font-mono">&lt;{m.from_email ?? "hr@caftanfactory.com"}&gt;</span>
                    </div>
                    {m.body && (
                      <pre className="text-xs bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
                        {m.body}
                      </pre>
                    )}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.attachments.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 font-medium"
                          >
                            <Paperclip className="w-3 h-3" />
                            {a.name}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-ink-3 flex-shrink-0 text-right">
                    {date.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" })}
                    <br />
                    {date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
