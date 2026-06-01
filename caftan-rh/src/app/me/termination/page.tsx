// Karim 2026-06-01 : page travailleur pour demander une rupture amiable.
// Affiche la demande en cours (s il y en a) + bouton de creation.

import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSignature, Clock, AlertTriangle } from "lucide-react";
import { TerminationRequestForm } from "./request-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_admin: { label: "En attente de validation RH", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Validée - en attente envoi pour signature", cls: "bg-blue-100 text-blue-800" },
  sent_for_signature: { label: "Envoyée pour signature", cls: "bg-blue-100 text-blue-800" },
  signed_employee: { label: "Signée par toi - en attente employeur", cls: "bg-blue-100 text-blue-800" },
  signed_employer: { label: "Signée par employeur - en attente toi", cls: "bg-blue-100 text-blue-800" },
  fully_signed: { label: "Pleinement signée", cls: "bg-green-100 text-green-800" },
  executed: { label: "Exécutée", cls: "bg-green-100 text-green-800" },
  refused: { label: "Refusée par RH", cls: "bg-red-100 text-red-800" },
  cancelled: { label: "Annulée", cls: "bg-gray-100 text-gray-800" },
};

export default async function MyTerminationPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, employer_org_key, start_date")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!emp) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Demande de rupture amiable</h1>
        <p className="text-sm text-muted-foreground">Aucune fiche employé liée à ton compte.</p>
      </div>
    );
  }

  const { data: terminations } = await admin
    .from("contract_terminations")
    .select("id, status, requested_at, earliest_effective_date, effective_date, refusal_reason, request_note, approval_note")
    .eq("employee_id", emp.id)
    .order("requested_at", { ascending: false })
    .limit(10);

  const active = (terminations ?? []).find((t) => !["refused", "cancelled", "executed"].includes(t.status));

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="w-6 h-6" />
          Rupture de contrat - Commun accord
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tu peux demander à mettre fin à ton contrat de travail de commun accord avec l&apos;employeur.
          La demande doit être validée par RH/Admin et la date de fin ne peut être avant J+3 (cooling-off légal).
        </p>
      </div>

      {!active && (
        <Card className="p-4">
          <TerminationRequestForm />
        </Card>
      )}

      {active && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Demande en cours</div>
            <Badge className={STATUS_LABEL[active.status]?.cls ?? ""}>
              {STATUS_LABEL[active.status]?.label ?? active.status}
            </Badge>
          </div>
          <div className="text-xs space-y-1">
            <div><span className="text-ink-3">Demandée le :</span> {new Date(active.requested_at).toLocaleString("fr-BE")}</div>
            {active.earliest_effective_date && (
              <div><span className="text-ink-3">Date min. autorisée :</span> {active.earliest_effective_date}</div>
            )}
            {active.effective_date && (
              <div><span className="text-ink-3">Date de fin validée :</span> <strong>{active.effective_date}</strong></div>
            )}
            {active.request_note && (
              <div className="bg-muted/40 p-2 rounded mt-2">
                <div className="text-ink-3 text-[10px]">Ton motif :</div>
                <div className="italic">{active.request_note}</div>
              </div>
            )}
            {active.approval_note && (
              <div className="bg-blue-50 border border-blue-200 p-2 rounded mt-2">
                <div className="text-ink-3 text-[10px]">Note RH :</div>
                <div>{active.approval_note}</div>
              </div>
            )}
          </div>

          {active.status === "pending_admin" && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
              <Clock className="w-3.5 h-3.5" />
              Ta demande est en cours d&apos;examen. Tu seras notifié dès qu&apos;elle est validée.
            </div>
          )}
        </Card>
      )}

      {(terminations ?? []).filter((t) => ["refused", "cancelled", "executed"].includes(t.status)).length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="font-semibold text-sm">Historique</div>
          {(terminations ?? []).filter((t) => ["refused", "cancelled", "executed"].includes(t.status)).map((t) => (
            <div key={t.id} className="text-xs border-l-2 border-line pl-2">
              <Badge className={STATUS_LABEL[t.status]?.cls ?? ""}>{STATUS_LABEL[t.status]?.label}</Badge>
              <span className="ml-2 text-ink-3">{new Date(t.requested_at).toLocaleDateString("fr-BE")}</span>
              {t.refusal_reason && (
                <div className="flex items-center gap-1 mt-1 text-red-700">
                  <AlertTriangle className="w-3 h-3" /> {t.refusal_reason}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
