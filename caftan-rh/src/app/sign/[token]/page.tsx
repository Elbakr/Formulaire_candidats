// Karim 2026-05-22 : page publique de signature de contrat. Acces par token
// magique (sans auth). L employe lit son contrat, le signe au doigt sur
// canvas, valide. Le PDF est envoye par mail au RH et a l employe.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignContractClient } from "./sign-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignContractPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  // Pas de requireRole : page publique
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("employee_contracts")
    .select(
      "id, employee_id, full_name, status, rendered_body, signed_at, signing_token_expires_at, template_id, template:contract_templates(name, title)",
    )
    .eq("signing_token", token)
    .maybeSingle();

  type ContractRow = {
    id: string;
    employee_id: string;
    full_name: string;
    status: string;
    rendered_body: string | null;
    signed_at: string | null;
    signing_token_expires_at: string | null;
    template_id: string | null;
    template: { name: string; title: string } | null;
  };
  const contract = row as ContractRow | null;
  if (!contract) notFound();

  const expired = contract.signing_token_expires_at
    ? new Date(contract.signing_token_expires_at) < new Date()
    : false;
  const alreadySigned = contract.status === "signed" || !!contract.signed_at;

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-2 to-surface px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gold-dark">
            {contract.template?.title ?? "Contrat de travail"}
          </h1>
          <p className="text-sm text-ink-2 mt-1">Pour {contract.full_name}</p>
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
            <div className="font-bold text-success">✓ Contrat déjà signé</div>
            <p className="text-sm text-ink-2 mt-1">
              Tu as signé ce contrat le {contract.signed_at
                ? new Date(contract.signed_at).toLocaleString("fr-BE")
                : "—"}. Une copie t&apos;a été envoyée par mail.
            </p>
          </div>
        ) : (
          <SignContractClient
            contractId={contract.id}
            token={token}
            renderedBody={contract.rendered_body ?? ""}
            fullName={contract.full_name}
          />
        )}
      </div>
    </div>
  );
}
