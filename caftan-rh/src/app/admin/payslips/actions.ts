"use server";

// Karim 2026-05-29 : server actions pour /admin/payslips
//   - uploadPayslipBatchAction(fd) : upload PDF + lance processBatch
//   - markPayslipPaidAction(id, note) : marque paye + reset advance
//   - sendPayslipToEmployeeAction(id, recipient) : envoie le PDF par mail

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/payslip-processor";
import { revalidatePath } from "next/cache";

export async function uploadPayslipBatchAction(formData: FormData): Promise<
  { ok: true; batchId: string; matched: number; unmatched: number } | { ok: false; error: string }
> {
  const profile = await requireRole(["admin", "rh"]);
  const file = formData.get("pdf") as File | null;
  const employerOrgKey = String(formData.get("employer_org_key") ?? "amd_megastore") as "amd_megastore" | "caftan_factory";
  if (!file || file.type !== "application/pdf") {
    return { ok: false, error: "Fichier PDF requis" };
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  try {
    const result = await processBatch({
      pdfBytes,
      filename: file.name,
      employerOrgKey,
      uploadedBy: profile.id,
      source: "manual_upload",
    });
    revalidatePath("/admin/payslips");
    return { ok: true, batchId: result.batchId, matched: result.matchedCount, unmatched: result.unmatchedCount };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function markPayslipPaidAction(payslipId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: payslip } = await admin
    .from("payslips")
    .select("id, employee_id, amount_to_pay, advance_deducted")
    .eq("id", payslipId)
    .single();
  if (!payslip) return { ok: false, error: "Fiche introuvable" };

  // Marque la fiche payee
  const { error: updErr } = await admin
    .from("payslips")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount: payslip.amount_to_pay,
      payment_note: note ?? null,
    })
    .eq("id", payslipId);
  if (updErr) return { ok: false, error: updErr.message };

  // Reset l avance sur l employee (consommee)
  if (Number(payslip.advance_deducted) > 0) {
    await admin
      .from("employees")
      .update({ salary_advance_amount: 0, salary_advance_updated_at: new Date().toISOString() })
      .eq("id", payslip.employee_id);
  }

  revalidatePath("/admin/payslips");
  return { ok: true };
}

export async function sendPayslipToEmployeeAction(
  payslipId: string,
  recipientEmail?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: payslip } = await admin
    .from("payslips")
    .select("id, employee_id, period_label, pdf_storage_path, pdf_filename, employer_org_key")
    .eq("id", payslipId)
    .single();
  if (!payslip) return { ok: false, error: "Fiche introuvable" };

  const { data: emp } = await admin
    .from("employees")
    .select("full_name, email, preferred_language")
    .eq("id", payslip.employee_id)
    .single();
  if (!emp) return { ok: false, error: "Employee introuvable" };

  const destEmail = recipientEmail?.trim() || emp.email;
  if (!destEmail) return { ok: false, error: "Pas d email destinataire" };

  // Genere URL signee 7 jours pour le PDF (privé)
  const { data: signed } = await admin.storage
    .from("payslips")
    .createSignedUrl(payslip.pdf_storage_path, 7 * 24 * 3600);
  if (!signed?.signedUrl) return { ok: false, error: "Impossible de generer URL PDF" };

  // Envoi via EmailJS
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { ok: false, error: "EmailJS non configure" };

  const lang = (emp.preferred_language ?? "fr") as "fr" | "nl" | "en";
  const messages = {
    fr: {
      subject: `Votre fiche de paie - ${payslip.period_label}`,
      body: `Bonjour ${emp.full_name?.split(" ")[0] ?? ""},\n\nVeuillez trouver ci-joint votre fiche de paie pour la periode ${payslip.period_label}.\n\nLien securise (valable 7 jours) :\n${signed.signedUrl}\n\nBien a vous,\nL equipe Caftan Factory (By AMD Megastore)`,
    },
    nl: {
      subject: `Uw loonbrief - ${payslip.period_label}`,
      body: `Beste ${emp.full_name?.split(" ")[0] ?? ""},\n\nIn bijlage vindt u uw loonbrief voor periode ${payslip.period_label}.\n\nBeveiligde link (7 dagen geldig) :\n${signed.signedUrl}\n\nMet vriendelijke groet,\nHet team Caftan Factory (By AMD Megastore)`,
    },
    en: {
      subject: `Your payslip - ${payslip.period_label}`,
      body: `Dear ${emp.full_name?.split(" ")[0] ?? ""},\n\nPlease find attached your payslip for period ${payslip.period_label}.\n\nSecure link (valid 7 days) :\n${signed.signedUrl}\n\nBest regards,\nThe Caftan Factory team (By AMD Megastore)`,
    },
  };
  const m = messages[lang];

  const params = {
    to_email: destEmail, email: destEmail, user_email: destEmail, candidate_email: destEmail,
    to: destEmail, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: m.subject, message: m.body, html_message: m.body.replace(/\n/g, "<br>"),
    body: m.body, content: m.body, html: m.body.replace(/\n/g, "<br>"),
    pdf_url: signed.signedUrl,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  if (!res.ok) return { ok: false, error: `Mail HTTP ${res.status}` };

  revalidatePath("/admin/payslips");
  return { ok: true };
}

export async function updateEmployeeAdvanceAction(
  employeeId: string,
  amount: number,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (amount < 0) return { ok: false, error: "Montant negatif interdit" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({
      salary_advance_amount: amount,
      salary_advance_updated_at: new Date().toISOString(),
      salary_advance_note: note ?? null,
    })
    .eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}
