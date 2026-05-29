// Karim 2026-05-29 : webhook DocuSeal pour update le statut de signature
// dans CaftanRH. Configure dans DocuSeal Admin > Webhooks avec URL :
//   https://<domain>/api/docuseal/webhook
//   Events : form.completed, form.declined, form.signed
//   Secret : DOCUSEAL_WEBHOOK_SECRET

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyDocusealWebhook } from "@/lib/docuseal-client";

export const dynamic = "force-dynamic";

type DocusealEvent = {
  // form.* = action d un signer individuel
  // submission.* = etat global de l envelope (tous signers)
  event_type:
    | "form.viewed"
    | "form.started"
    | "form.completed"
    | "form.declined"
    | "submission.completed"
    | "submission.expired";
  timestamp: string;
  data: {
    id: number;
    submission_id?: number;
    template_id?: number;
    email?: string;
    status?: string;
    completed_at?: string;
    audit_log_url?: string;
    combined_document_url?: string;
    metadata?: Record<string, string>;
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-docuseal-signature");

  // Verifie HMAC si secret configure (sinon ouvert - dev mode)
  if (process.env.DOCUSEAL_WEBHOOK_SECRET) {
    if (!verifyDocusealWebhook(sig, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: DocusealEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const submissionId = event.data.submission_id ?? event.data.id;
  const employeeId = event.data.metadata?.employee_id;
  const contractId = event.data.metadata?.contract_id;

  if (event.event_type === "submission.completed") {
    // Tous les signers ont signe -> contrat 100% finalise
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: event.data.combined_document_url,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }
  } else if (event.event_type === "form.completed") {
    // Le contrat a ete signe - update employee_contracts
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: event.data.combined_document_url,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }

    // Notification RH
    if (employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .select("full_name")
        .eq("id", employeeId)
        .maybeSingle();
      const name = (emp as { full_name?: string } | null)?.full_name ?? "?";
      const { data: hrs } = await admin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "rh"]);
      const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
      if (hrIds.length > 0) {
        await admin.from("notifications").insert(
          hrIds.map((hrId) => ({
            recipient_id: hrId,
            kind: "contract_signed",
            title: `Contrat signé : ${name}`,
            body: `Le contrat de ${name} a été signé électroniquement via DocuSeal.`,
            link: contractId ? `/planning/employees/${employeeId}/contract` : `/planning/employees/${employeeId}`,
            data: { submissionId, employeeId, contractId },
          })),
        );
      }
    }
  } else if (event.event_type === "form.declined") {
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          docuseal_submission_id: submissionId,
          docuseal_status: "declined",
        })
        .eq("id", contractId);
    }
  }

  return NextResponse.json({ ok: true });
}
