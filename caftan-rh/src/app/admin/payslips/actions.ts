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

/**
 * Karim 2026-05-30 : permet d associer manuellement un PDF non-matche
 * (ou de re-affecter une fiche au mauvais employee) + mettre a jour les
 * montants si le parser a foire.
 */
export async function reassignPayslipAction(
  payslipId: string,
  newEmployeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, iban, bic, preferred_language, salary_advance_amount")
    .eq("id", newEmployeeId)
    .single();
  if (!emp) return { ok: false, error: "Employee introuvable" };

  // Regenere le QR avec les nouvelles donnees
  const { data: payslip } = await admin
    .from("payslips")
    .select("net_amount, period_year, period_month")
    .eq("id", payslipId)
    .single();
  if (!payslip) return { ok: false, error: "Fiche introuvable" };

  const { generateEpcQr, defaultSalaryRemittance } = await import("@/lib/qr-epc");
  const advance = Number(emp.salary_advance_amount ?? 0);
  const net = Number(payslip.net_amount);
  const advanceDeducted = Math.min(advance, net);
  const amountToPay = Math.max(0, net - advanceDeducted);

  let qrPayload: string | null = null;
  let qrPng: string | null = null;
  if (emp.iban && amountToPay > 0) {
    try {
      const epc = await generateEpcQr({
        beneficiaryName: emp.full_name,
        iban: emp.iban,
        bic: emp.bic ?? undefined,
        amountEur: amountToPay,
        remittanceInfo: defaultSalaryRemittance(payslip.period_month, payslip.period_year, (emp.preferred_language ?? "fr") as "fr" | "nl" | "en"),
        purposeCode: "SALA",
      });
      qrPayload = epc.payload;
      qrPng = epc.qrPngDataUrl;
    } catch (e) {
      console.error("QR regen failed:", e);
    }
  }

  const { error } = await admin
    .from("payslips")
    .update({
      employee_id: newEmployeeId,
      advance_deducted: advanceDeducted,
      amount_to_pay: amountToPay,
      qr_epc_payload: qrPayload,
      qr_png_data_url: qrPng,
    })
    .eq("id", payslipId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/payslips");
  return { ok: true };
}

/**
 * Karim 2026-05-30 : permet d editer manuellement le net_amount si le parser
 * a foire. Recalcule amount_to_pay + regenere le QR.
 */
export async function updatePayslipAmountAction(
  payslipId: string,
  newNetAmount: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (newNetAmount < 0) return { ok: false, error: "Montant invalide" };
  const admin = createAdminClient();

  const { data: payslip } = await admin
    .from("payslips")
    .select("employee_id, period_year, period_month, advance_deducted")
    .eq("id", payslipId)
    .single();
  if (!payslip) return { ok: false, error: "Fiche introuvable" };

  const { data: emp } = await admin
    .from("employees")
    .select("full_name, iban, bic, preferred_language, salary_advance_amount")
    .eq("id", payslip.employee_id)
    .single();
  if (!emp) return { ok: false, error: "Employee introuvable" };

  const advance = Number(emp.salary_advance_amount ?? 0);
  const advanceDeducted = Math.min(advance, newNetAmount);
  const amountToPay = Math.max(0, newNetAmount - advanceDeducted);

  const { generateEpcQr, defaultSalaryRemittance } = await import("@/lib/qr-epc");
  let qrPayload: string | null = null;
  let qrPng: string | null = null;
  if (emp.iban && amountToPay > 0) {
    try {
      const epc = await generateEpcQr({
        beneficiaryName: emp.full_name,
        iban: emp.iban,
        bic: emp.bic ?? undefined,
        amountEur: amountToPay,
        remittanceInfo: defaultSalaryRemittance(payslip.period_month, payslip.period_year, (emp.preferred_language ?? "fr") as "fr" | "nl" | "en"),
        purposeCode: "SALA",
      });
      qrPayload = epc.payload;
      qrPng = epc.qrPngDataUrl;
    } catch (e) {
      console.error("QR regen failed:", e);
    }
  }

  const { error } = await admin
    .from("payslips")
    .update({
      net_amount: newNetAmount,
      advance_deducted: advanceDeducted,
      amount_to_pay: amountToPay,
      qr_epc_payload: qrPayload,
      qr_png_data_url: qrPng,
    })
    .eq("id", payslipId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/payslips");
  return { ok: true };
}

/**
 * Karim 2026-05-30 : supprime un batch (et ses payslips). Pour permettre
 * de re-droper le PDF apres correction du parser.
 */
export async function deleteBatchAction(batchId: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  // Cascade : payslips ont FK source_batch_id non NOT NULL, donc on delete d abord
  const { data: ps } = await admin.from("payslips").select("id").eq("source_batch_id", batchId);
  if (ps && ps.length > 0) {
    await admin.from("payslips").delete().in("id", ps.map((p) => p.id));
  }
  const { error } = await admin.from("payslip_batches").delete().eq("id", batchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/payslips");
  return { ok: true };
}

/**
 * Karim 2026-05-30 : URL signee 1h pour voir/DL le PDF de la fiche.
 */
export async function getPayslipPdfUrlAction(payslipId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: payslip } = await admin.from("payslips").select("pdf_storage_path").eq("id", payslipId).single();
  if (!payslip?.pdf_storage_path) return { ok: false, error: "PDF introuvable" };
  const { data } = await admin.storage.from("payslips").createSignedUrl(payslip.pdf_storage_path, 3600);
  if (!data?.signedUrl) return { ok: false, error: "URL non disponible" };
  return { ok: true, url: data.signedUrl };
}

/**
 * Karim 2026-05-30 : met a jour l avance + recalcule amount_to_pay + regénère QR.
 * Cette action est utilisable depuis la fiche payslip directement (inline).
 */
export async function setAdvanceAndRecomputeAction(
  payslipId: string,
  newAdvance: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (newAdvance < 0) return { ok: false, error: "Montant negatif interdit" };
  const admin = createAdminClient();

  const { data: payslip } = await admin
    .from("payslips")
    .select("employee_id, net_amount, period_year, period_month, payment_iban, payment_holder_name")
    .eq("id", payslipId)
    .single();
  if (!payslip) return { ok: false, error: "Fiche introuvable" };
  if (!payslip.employee_id) return { ok: false, error: "Associe d abord la fiche a un employé" };

  // Update advance sur employee
  await admin.from("employees").update({
    salary_advance_amount: newAdvance,
    salary_advance_updated_at: new Date().toISOString(),
  }).eq("id", payslip.employee_id);

  // Recalcule sur la fiche
  const net = Number(payslip.net_amount);
  const advanceDeducted = Math.min(newAdvance, net);
  const amountToPay = Math.max(0, net - advanceDeducted);

  // Regenere QR
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, iban, bic, preferred_language")
    .eq("id", payslip.employee_id)
    .single();
  const iban = emp?.iban ?? payslip.payment_iban;
  const holder = emp?.full_name ?? payslip.payment_holder_name;

  const { generateEpcQr, defaultSalaryRemittance } = await import("@/lib/qr-epc");
  let qrPayload: string | null = null;
  let qrPng: string | null = null;
  if (iban && holder && amountToPay > 0) {
    try {
      const epc = await generateEpcQr({
        beneficiaryName: holder,
        iban,
        bic: emp?.bic ?? undefined,
        amountEur: amountToPay,
        remittanceInfo: defaultSalaryRemittance(payslip.period_month, payslip.period_year, (emp?.preferred_language ?? "fr") as "fr" | "nl" | "en"),
        purposeCode: "SALA",
      });
      qrPayload = epc.payload;
      qrPng = epc.qrPngDataUrl;
    } catch (e) {
      console.error("QR regen failed:", e);
    }
  }

  const { error } = await admin.from("payslips").update({
    advance_deducted: advanceDeducted,
    amount_to_pay: amountToPay,
    qr_epc_payload: qrPayload,
    qr_png_data_url: qrPng,
  }).eq("id", payslipId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payslips");
  return { ok: true };
}

/**
 * Karim 2026-05-31 : liste TOUS les employees affiliables (active + on_leave)
 * pour le select de re-affectation manuelle. Exclut juste les archived.
 * Retourne aussi le status pour affichage visuel.
 */
export async function listActiveEmployeesAction(): Promise<
  Array<{ id: string; full_name: string; iban: string | null; status: string }>
> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("id, full_name, iban, status")
    .in("status", ["active", "on_leave"])
    .order("full_name");
  return (data ?? []) as Array<{ id: string; full_name: string; iban: string | null; status: string }>;
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
