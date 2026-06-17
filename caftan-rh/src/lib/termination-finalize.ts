import "server-only";

// Karim 2026-06-17 : finalisation d'une convention de rupture PLEINEMENT signée
// (les 2 parties). Factorisé pour être appelé par la signature INTERNE
// (/sign-termination/[token]) — remplace l'ancien chemin DocuSeal/sync.
//
// Fait, dans l'ordre :
//   1. stocke le PDF signé (bucket terminations) -> signed_pdf_storage_path
//   2. passe la rupture en fully_signed (+ dates signature)
//   3. clôture automatisée de l'emploi (archive + Dimona OUT + accès coupé)
//   4. notifie RH + mails HR & travailleur avec le PDF signé + audit
//
// Best-effort sur les étapes annexes : ne casse jamais la signature elle-même.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicBaseUrl } from "@/lib/public-base-url";

export async function finalizeSignedTermination(
  admin: SupabaseClient,
  terminationId: string,
  signedPdf: Uint8Array | null,
): Promise<void> {
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, effective_date")
    .eq("id", terminationId)
    .maybeSingle();
  if (!t) return;

  // 1. PDF signé -> bucket terminations
  let storedPath: string | null = null;
  if (signedPdf) {
    try {
      storedPath = `signed/${terminationId}.pdf`;
      await admin.storage.from("terminations").upload(storedPath, signedPdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    } catch (e) {
      console.warn("[finalizeTermination] PDF upload err:", (e as Error).message);
      storedPath = null;
    }
  }

  // 2. statut fully_signed
  const nowISO = new Date().toISOString();
  await admin
    .from("contract_terminations")
    .update({
      status: "fully_signed",
      ...(storedPath ? { signed_pdf_storage_path: storedPath } : {}),
      employee_signed_at: nowISO,
      employer_signed_at: nowISO,
    })
    .eq("id", terminationId);

  // 3. clôture automatisée de l'emploi
  try {
    const { closeEmployment } = await import("@/lib/employment-lifecycle");
    await closeEmployment(admin, t.employee_id, t.effective_date, "termination", { sendNotice: true });
  } catch { /* best-effort */ }

  // 4. notifs + mails HR & travailleur + audit
  try {
    const { data: emp } = await admin.from("employees").select("full_name, email").eq("id", t.employee_id).maybeSingle();
    const empName = (emp as { full_name?: string } | null)?.full_name ?? "?";
    const empEmail = (emp as { email?: string } | null)?.email ?? null;

    let signedUrl: string | null = null;
    if (storedPath) {
      const { data: s } = await admin.storage.from("terminations").createSignedUrl(storedPath, 7 * 24 * 3600);
      if (s?.signedUrl) signedUrl = s.signedUrl;
    }

    const { data: hrs } = await admin.from("profiles").select("id, email").in("role", ["admin", "rh"]);
    const hrList = (hrs ?? []) as Array<{ id: string; email: string | null }>;
    if (hrList.length > 0) {
      await admin.from("notifications").insert(
        hrList.map((hr) => ({
          recipient_id: hr.id,
          kind: "termination_signed",
          title: `✍️ Rupture signée — ${empName}`,
          body: `Convention de cessation pleinement signée par les 2 parties.`,
          link: `/planning/employees/${t.employee_id}`,
          data: { terminationId, signedUrl, effective_date: t.effective_date },
        })),
      );
    }

    const { sendAppMail } = await import("@/lib/app-mail");
    const baseAppUrl = getPublicBaseUrl();
    if (signedUrl) {
      const recipients = new Set<string>(["hr@caftanfactory.com", ...hrList.map((h) => h.email).filter((e): e is string => !!e)]);
      const subject = `Convention de rupture signée — ${empName}`;
      const body = `Bonjour,\n\nLa convention de cessation de contrat de ${empName} a été signée par les 2 parties.\n\n📅 Date de fin : ${t.effective_date}\n\n📎 PDF signé (lien 7j) :\n${signedUrl}\n\nValise documents : ${baseAppUrl}/rh/documents?employee=${t.employee_id}\n\n⚠ Actions : Dimona OUT · solde tout compte · certificat C4.\n\nL'équipe CaftanRH`;
      for (const to of recipients) {
        try {
          await sendAppMail({
            to, toName: "RH", subject, body,
            attachmentUrls: [{ name: "Convention signée.pdf", url: signedUrl }],
            source: "termination_signed_hr", sourceRef: terminationId, employeeId: t.employee_id,
          });
        } catch { /* */ }
      }
      if (empEmail) {
        const empFirst = empName.split(/\s+/)[0];
        const empBody = `Bonjour ${empFirst},\n\nTa convention de cessation de contrat amiable est signée par les 2 parties.\n\n📅 Date de fin : ${t.effective_date}\n\n📎 Télécharge ton PDF :\n${signedUrl}\n\nÉgalement dans ton espace : ${baseAppUrl}/me/termination\n\nL'équipe Caftan Factory`;
        try {
          await sendAppMail({
            to: empEmail, toName: empName, subject: `Ta convention signée — ${empName}`, body: empBody,
            attachmentUrls: [{ name: "Convention signée.pdf", url: signedUrl }],
            source: "termination_signed_employee", sourceRef: terminationId, employeeId: t.employee_id,
          });
        } catch { /* */ }
      }
    }

    await admin.from("document_audit_log").insert({
      employee_id: t.employee_id,
      doc_type: "contract",
      doc_ref: terminationId,
      doc_label: "Convention rupture - pleinement signée (signature interne)",
      action: "sign",
      channel: "internal_sign",
      actor_name: empName,
    });
  } catch (e) {
    console.warn("[finalizeTermination] notify err:", (e as Error).message);
  }
}
