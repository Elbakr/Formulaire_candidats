// Karim 2026-06-03 : dashboard centralisé formations + certifications.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { AddTrainingButton } from "./add-training-button";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  haccp: "🧼 HACCP", first_aid: "🚑 Secourisme", fire_safety: "🔥 Sécurité incendie",
  languages: "🗣️ Langues", cash_register: "💳 Caisse", security: "🛡️ Sécurité",
  forklift: "🚜 Chariot élévateur", allergens: "🚫 Allergènes", gdpr: "📋 RGPD",
  other: "📦 Autre",
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  valid: { label: "Valide", cls: "bg-green-100 text-green-900", icon: CheckCircle2 },
  expiring_soon: { label: "Expire bientôt (<60j)", cls: "bg-amber-100 text-amber-900", icon: Clock },
  expired: { label: "Expirée", cls: "bg-red-100 text-red-900", icon: X },
  revoked: { label: "Révoquée", cls: "bg-gray-100 text-gray-800", icon: X },
};

export default async function TrainingsAdminPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  await requireRole(["admin", "rh", "manager"]);
  const params = await searchParams;
  const filterStatus = params.status ?? "all";
  const filterKind = params.kind ?? "all";

  const admin = createAdminClient();
  let q = admin.from("training_records")
    .select("id, kind, title, provider, obtained_at, expires_at, level, status, certificate_storage_path, employee:employees(id, full_name, job_title)")
    .order("expires_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (filterStatus !== "all") q = q.eq("status", filterStatus);
  if (filterKind !== "all") q = q.eq("kind", filterKind);
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string; kind: string; title: string; provider: string | null;
    obtained_at: string; expires_at: string | null; level: string | null;
    status: string; certificate_storage_path: string | null;
    employee?: { id: string; full_name: string; job_title: string | null } | null;
  }>;

  const { data: countsRaw } = await admin.from("training_records").select("status, kind");
  const counts = new Map<string, number>();
  for (const r of countsRaw ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const expiringSoon = counts.get("expiring_soon") ?? 0;
  const expired = counts.get("expired") ?? 0;

  const employees = await admin.from("employees").select("id, full_name").in("status", ["active", "on_leave"]).order("full_name");

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6" />
            Formations & certifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tracking HACCP, sécurité, langues, etc. Rappels auto avant expiration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {expired > 0 && (
            <Badge className="bg-red-100 text-red-900 border border-red-300">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {expired} expirées
            </Badge>
          )}
          {expiringSoon > 0 && (
            <Badge className="bg-amber-100 text-amber-900 border border-amber-300">
              <Clock className="w-3 h-3 inline mr-1" />
              {expiringSoon} expirent bientôt
            </Badge>
          )}
          <AddTrainingButton employees={(employees.data ?? []) as Array<{ id: string; full_name: string }>} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Statut :</span>
        {[
          { k: "all", l: "Tous" }, { k: "valid", l: "Valides" }, { k: "expiring_soon", l: "Expire bientôt" },
          { k: "expired", l: "Expirées" }, { k: "revoked", l: "Révoquées" },
        ].map((s) => (
          <Link
            key={s.k}
            href={`/rh/trainings?status=${s.k}${filterKind !== "all" ? `&kind=${filterKind}` : ""}`}
            className={`px-2 py-1 rounded-full ${filterStatus === s.k ? "bg-foreground text-background" : "bg-muted hover:bg-line"}`}
          >
            {s.l}
          </Link>
        ))}
        <span className="mx-2 text-ink-3">·</span>
        <span className="font-semibold">Type :</span>
        <Link href={`/rh/trainings?status=${filterStatus}`} className={`px-2 py-1 rounded-full ${filterKind === "all" ? "bg-foreground text-background" : "bg-muted hover:bg-line"}`}>Tous</Link>
        {Object.entries(KIND_LABEL).map(([k, l]) => (
          <Link
            key={k}
            href={`/rh/trainings?status=${filterStatus}&kind=${k}`}
            className={`px-2 py-1 rounded-full ${filterKind === k ? "bg-foreground text-background" : "bg-muted hover:bg-line"}`}
          >
            {l}
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucune formation pour ces filtres.
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((t) => {
          const meta = STATUS_META[t.status] ?? STATUS_META.revoked;
          const Icon = meta.icon;
          return (
            <Card key={t.id} className={`p-3 ${t.status === "expired" ? "border-red-300 bg-red-50/30" : ""}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/planning/employees/${t.employee?.id}`} className="font-semibold text-sm hover:underline">
                      {t.employee?.full_name ?? "—"}
                    </Link>
                    <Badge className={`text-[10px] ${meta.cls}`}>
                      <Icon className="w-3 h-3 inline mr-1" />
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-ink-3">{KIND_LABEL[t.kind] ?? t.kind}</span>
                  </div>
                  <div className="text-xs mt-1">
                    <strong>{t.title}</strong>
                    {t.provider && <span className="text-ink-3"> · {t.provider}</span>}
                    {t.level && <span className="text-ink-3"> · {t.level}</span>}
                  </div>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    Obtenue le <strong>{t.obtained_at}</strong>
                    {t.expires_at && <span> · Expire le <strong>{t.expires_at}</strong></span>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
