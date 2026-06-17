// Karim 2026-06-17 : page PUBLIQUE de signature de la convention de rupture
// amiable (modèle 402.00). Accès par token magique (sans auth), même principe
// que /sign pour les contrats. Affiche TON layout validé (signed_body) puis
// capture la signature du travailleur. Remplace DocuSeal.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { SignTerminationClient } from "./sign-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignTerminationPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("contract_terminations")
    .select("id, employee_id, status, signed_body, signing_token_expires_at, employee_signed_at, effective_date")
    .eq("signing_token", token)
    .maybeSingle();

  type TRow = {
    id: string;
    employee_id: string;
    status: string;
    signed_body: string | null;
    signing_token_expires_at: string | null;
    employee_signed_at: string | null;
    effective_date: string | null;
  };
  const term = row as TRow | null;
  if (!term) notFound();

  const { data: emp } = await admin
    .from("employees")
    .select("full_name")
    .eq("id", term.employee_id)
    .maybeSingle();
  const fullName = (emp as { full_name?: string } | null)?.full_name ?? "";

  const expired = term.signing_token_expires_at
    ? new Date(term.signing_token_expires_at) < new Date()
    : false;
  const alreadySigned = term.status === "fully_signed" || term.status === "executed" || !!term.employee_signed_at;

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-2 to-surface px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gold-dark">
            Convention de cessation de contrat — Commun accord
          </h1>
          <p className="text-sm text-ink-2 mt-1">Pour {fullName}</p>
        </div>

        {expired ? (
          <div className="rounded-md border border-danger bg-danger-light/30 p-4 text-center">
            <div className="font-bold text-danger">⏱ Lien expiré</div>
            <p className="text-sm text-ink-2 mt-1">
              Ce lien de signature a expiré. Contacte l&apos;équipe RH pour qu&apos;un nouveau te soit envoyé.
            </p>
          </div>
        ) : alreadySigned ? (
          <div className="rounded-md border border-success bg-success-light/30 p-4 text-center">
            <div className="font-bold text-success">✓ Convention déjà signée</div>
            <p className="text-sm text-ink-2 mt-1">
              Tu as déjà signé cette convention
              {term.employee_signed_at ? ` le ${new Date(term.employee_signed_at).toLocaleString("fr-BE")}` : ""}.
              Une copie t&apos;a été envoyée par mail.
            </p>
          </div>
        ) : !term.signed_body ? (
          <div className="rounded-md border border-danger bg-danger-light/30 p-4 text-center">
            <div className="font-bold text-danger">Document indisponible</div>
            <p className="text-sm text-ink-2 mt-1">La convention n&apos;est pas prête. Contacte l&apos;équipe RH.</p>
          </div>
        ) : (
          <SignTerminationClient
            terminationId={term.id}
            token={token}
            renderedBody={term.signed_body}
            fullName={fullName}
          />
        )}
      </div>
    </div>
  );
}
