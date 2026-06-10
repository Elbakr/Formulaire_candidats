import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

// Karim 2026-06-10 : page de DETAIL d'une notification. Avant, cliquer une
// notif sans `link` n'affichait rien. Ici on montre le titre + le corps complet
// + les donnees structurees (ex: rapport de sante systeme = liste
// probleme/solution), et on marque la notif comme lue.

type Issue = {
  severity?: "critical" | "warning" | "info" | "ok" | string;
  title?: string;
  problem?: string;
  solution?: string;
};

type SevStyle = { Icon: typeof AlertCircle; cls: string; bg: string; label: string };
const SEV: Record<string, SevStyle> = {
  critical: { Icon: AlertCircle, cls: "text-danger", bg: "bg-danger-light/40 border-danger", label: "Critique" },
  warning: { Icon: AlertTriangle, cls: "text-warn", bg: "bg-warn-light/40 border-warn", label: "Attention" },
  info: { Icon: Info, cls: "text-info", bg: "bg-info-light/40 border-info", label: "Info" },
  ok: { Icon: CheckCircle2, cls: "text-success", bg: "bg-success-light/40 border-success", label: "OK" },
};

function sevOf(s?: string): SevStyle {
  return SEV[s ?? "info"] ?? SEV.info;
}

export default async function NotificationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireProfile();
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: n } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, data, read_at, created_at")
    .eq("id", id)
    .eq("recipient_id", user.id)
    .maybeSingle();
  if (!n) notFound();
  const notif = n as {
    id: string; kind: string; title: string; body: string | null;
    link: string | null; data: Record<string, unknown> | null;
    read_at: string | null; created_at: string;
  };

  // Marque comme lue (best-effort).
  if (!notif.read_at) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_id", user.id);
  }

  const data = (notif.data ?? {}) as Record<string, unknown>;
  const issues = Array.isArray(data.issues) ? (data.issues as Issue[]) : null;
  const hasResource = !!notif.link && !notif.link.startsWith("/me/notifications");
  // Donnees structurees hors `issues`, affichees en cle/valeur.
  const otherData = Object.entries(data).filter(([k]) => k !== "issues");

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/me/notifications" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-gold-dark">
        <ArrowLeft className="h-4 w-4" /> Toutes les notifications
      </Link>

      <Card>
        <div className="p-4 space-y-3">
          <div>
            <h1 className="text-xl font-bold">{notif.title}</h1>
            <div className="text-[11px] text-ink-3 mt-1">
              {fmtDateTime(notif.created_at)} · {notif.kind}
            </div>
          </div>

          {notif.body ? (
            <p className="text-sm text-ink-2 whitespace-pre-wrap">{notif.body}</p>
          ) : null}

          {hasResource ? (
            <Link
              href={notif.link as string}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-dark hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Ouvrir l'élément concerné
            </Link>
          ) : null}
        </div>
      </Card>

      {/* Rapport structure (ex: sante systeme) */}
      {issues && issues.length > 0 ? (
        <div className="space-y-2">
          {issues.map((it, i) => {
            const s = sevOf(it.severity);
            return (
              <Card key={i} className={`border-2 ${s.bg}`}>
                <div className="p-3 space-y-1.5">
                  <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${s.cls}`}>
                    <s.Icon className="h-4 w-4" /> {s.label}
                  </div>
                  {it.title ? <div className="font-bold text-sm">{it.title}</div> : null}
                  {it.problem ? (
                    <div className="text-sm text-ink">
                      <span className="font-semibold">Problème : </span>
                      {it.problem}
                    </div>
                  ) : null}
                  {it.solution ? (
                    <div className="text-sm text-ink-2">
                      <span className="font-semibold">Solution : </span>
                      {it.solution}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Autres donnees brutes eventuelles */}
      {!issues && otherData.length > 0 ? (
        <Card>
          <div className="p-4 space-y-1 text-sm">
            {otherData.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-semibold text-ink-3">{k} :</span>
                <span className="text-ink break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
