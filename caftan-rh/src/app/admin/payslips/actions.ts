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
  const { profile } = await requireRole(["admin", "rh"]);
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

/**
 * Karim 2026-05-31 : bulk - marque plusieurs fiches payées + reset les avances.
 */
export async function markPayslipsPaidBulkAction(
  payslipIds: string[],
  note?: string,
): Promise<{ ok: boolean; updated?: number; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (payslipIds.length === 0) return { ok: false, error: "Aucune fiche selectionnée" };
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("payslips")
    .select("id, employee_id, amount_to_pay, advance_deducted")
    .in("id", payslipIds);
  if (!rows || rows.length === 0) return { ok: false, error: "Fiches introuvables" };

  const nowISO = new Date().toISOString();
  for (const r of rows) {
    await admin
      .from("payslips")
      .update({
        payment_status: "paid",
        paid_at: nowISO,
        paid_amount: r.amount_to_pay,
        payment_note: note ?? "Marqué payé en bloc",
      })
      .eq("id", r.id);
    if (Number(r.advance_deducted) > 0 && r.employee_id) {
      await admin
        .from("employees")
        .update({ salary_advance_amount: 0, salary_advance_updated_at: nowISO })
        .eq("id", r.employee_id);
    }
  }
  revalidatePath("/admin/payslips");
  return { ok: true, updated: rows.length };
}

/**
 * Karim 2026-06-02 : envoi groupé de fiches en cas de fin de contrat.
 * Le secrétariat social (HR Consult) envoie typiquement 2 fiches en fin de
 * contrat pour un CDD/CDI (salaire final + pécule vacances/13e mois prorata),
 * ou 1 fiche pour un étudiant. On les regroupe dans UN seul mail avec un
 * message PME pro de remerciement.
 */
export async function sendOffboardingPayslipsAction(args: {
  employeeId: string;
  payslipIds: string[];
  templateId?: string;
  customSubject?: string;
  customBody?: string;
  recipientEmailOverride?: string;
  // Karim 2026-06-02 : pieces jointes additionnelles uploaded depuis le dialog
  extraAttachments?: Array<{ filename: string; contentBase64: string; contentType: string }>;
}): Promise<{ ok: boolean; sent?: boolean; error?: string; sentTo?: string; provider?: string }> {
  await requireRole(["admin", "rh"]);
  if (args.payslipIds.length === 0) return { ok: false, error: "Aucune fiche sélectionnée" };
  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, email, contract_type, start_date, end_date, status, job_title")
    .eq("id", args.employeeId)
    .single();
  if (!emp) return { ok: false, error: "Employee introuvable" };

  const destEmail = args.recipientEmailOverride?.trim() || emp.email;
  if (!destEmail) return { ok: false, error: "Pas d'email destinataire" };

  // Charge les fiches
  const { data: payslips } = await admin
    .from("payslips")
    .select("id, employee_id, period_label, period_year, period_month, pdf_storage_path, pdf_filename, net_amount, amount_to_pay")
    .in("id", args.payslipIds)
    .eq("employee_id", args.employeeId);
  if (!payslips || payslips.length === 0) return { ok: false, error: "Fiches introuvables" };

  // Karim 2026-06-02 : download + watermark + accumule bytes pour pieces
  // jointes natives (Resend) + URLs signed comme fallback EmailJS.
  const { applyDynamicWatermark } = await import("@/lib/pdf-watermark");
  const attachmentBytes: Array<{ filename: string; content: Uint8Array; contentType: string; period: string }> = [];
  const attachmentUrls: Array<{ name: string; url: string; period: string }> = [];

  for (const ps of payslips) {
    if (!ps.pdf_storage_path) continue;
    let wmBytes: Uint8Array | null = null;
    let signedUrl: string | null = null;
    try {
      const { data: blob } = await admin.storage.from("payslips").download(ps.pdf_storage_path);
      if (blob) {
        const origBytes = new Uint8Array(await blob.arrayBuffer());
        wmBytes = await applyDynamicWatermark(origBytes, {
          recipientName: emp.full_name ?? destEmail,
          recipientEmail: destEmail,
          docRef: ps.id.slice(0, 8),
          diagonalText: "COPIE PERSONNELLE - FIN DE CONTRAT",
        });
        const wmPath = `${ps.pdf_storage_path.replace(/\.pdf$/i, "")}__offboard__${Date.now()}.pdf`;
        const up = await admin.storage
          .from("payslips")
          .upload(wmPath, wmBytes, { contentType: "application/pdf", upsert: true });
        if (!up.error) {
          const signed = await admin.storage.from("payslips").createSignedUrl(wmPath, 30 * 24 * 3600);
          if (signed.data?.signedUrl) signedUrl = signed.data.signedUrl;
        }
      }
    } catch (e) {
      console.warn("[offboarding] watermark fallback:", (e as Error).message);
    }
    if (!signedUrl) {
      const { data: signed } = await admin.storage
        .from("payslips")
        .createSignedUrl(ps.pdf_storage_path, 30 * 24 * 3600);
      signedUrl = signed?.signedUrl ?? null;
    }
    const period = ps.period_label ?? `${ps.period_year}-${String(ps.period_month).padStart(2, "0")}`;
    const filename = ps.pdf_filename ?? `Fiche de paie ${period}.pdf`;
    if (wmBytes) {
      attachmentBytes.push({ filename, content: wmBytes, contentType: "application/pdf", period });
    }
    if (signedUrl) {
      attachmentUrls.push({ name: filename, url: signedUrl, period });
    }
  }
  if (attachmentUrls.length === 0 && attachmentBytes.length === 0) return { ok: false, error: "Aucun PDF accessible" };

  // Karim 2026-06-02 : pieces jointes additionnelles ajoutees par l'admin
  // (certificat travail, attestation, etc.) — uploadees en base64 depuis le UI
  if (args.extraAttachments && args.extraAttachments.length > 0) {
    for (const extra of args.extraAttachments) {
      try {
        const bytes = new Uint8Array(Buffer.from(extra.contentBase64, "base64"));
        attachmentBytes.push({
          filename: extra.filename,
          content: bytes,
          contentType: extra.contentType,
          period: "extra",
        });
        // Upload aussi pour fallback EmailJS URL
        const path = `extra/${args.employeeId}/${Date.now()}__${extra.filename}`;
        const up = await admin.storage.from("payslips").upload(path, bytes, {
          contentType: extra.contentType,
          upsert: true,
        });
        if (!up.error) {
          const signed = await admin.storage.from("payslips").createSignedUrl(path, 30 * 24 * 3600);
          if (signed.data?.signedUrl) {
            attachmentUrls.push({ name: extra.filename, url: signed.data.signedUrl, period: "extra" });
          }
        }
      } catch (e) {
        console.warn("[offboarding] extra attachment err:", (e as Error).message);
      }
    }
  }

  // Karim 2026-06-02 : selection du template
  const { getTemplateById, getDefaultTemplateForOffboarding } = await import("@/lib/message-templates");
  const tpl = args.templateId
    ? getTemplateById(args.templateId) ?? getDefaultTemplateForOffboarding(emp.contract_type)
    : getDefaultTemplateForOffboarding(emp.contract_type);
  const firstName = emp.full_name?.split(" ")[0] ?? "";
  const periodsList = (attachmentBytes.length > 0 ? attachmentBytes : attachmentUrls).map((a) => `• ${a.period}`).join("\n");
  const rendered = tpl.render({
    firstName,
    fullName: emp.full_name ?? "",
    employerName: "Caftan Factory (By AMD Megastore)",
    contractType: emp.contract_type,
    periodsList,
    currentYear: new Date().getFullYear(),
    hrEmail: "hr@caftanfactory.com",
  });
  const subject = args.customSubject?.trim() || rendered.subject;
  const body = args.customBody?.trim() || rendered.body;

  // Karim 2026-06-02 : envoi via Resend (PJ natives) ou fallback EmailJS
  const { sendMailWithAttachments } = await import("@/lib/mail-with-attachments");
  const result = await sendMailWithAttachments({
    to: destEmail,
    toName: emp.full_name ?? undefined,
    subject,
    body,
    replyTo: "hr@caftanfactory.com",
    attachments: attachmentBytes.length > 0 ? attachmentBytes : undefined,
    attachmentUrls: attachmentUrls.map((a) => ({ name: a.name, url: a.url })),
    bccHr: true, // Karim 2026-06-02 : copie BCC vers hr@caftanfactory.com pour archivage boite commune
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Envoi KO" };

  // Log outbound_mails + audit
  try {
    const { logOutboundMail } = await import("@/lib/outbound-mail-log");
    await logOutboundMail({
      recipient_email: destEmail,
      recipient_name: emp.full_name,
      subject,
      body,
      source: "payslip_share",
      source_ref: args.payslipIds.join(","),
      employee_id: args.employeeId,
      attachments: attachmentUrls.map((a) => ({ name: a.name, url: a.url })),
    });
    for (const psId of args.payslipIds) {
      const { logDocAudit } = await import("@/lib/document-audit-log");
      await logDocAudit({
        employee_id: args.employeeId,
        doc_type: "payslip",
        doc_ref: psId,
        doc_label: `Envoi départ (${tpl.label}) — ${attachmentUrls.length} fiche(s)`,
        action: "share_email",
        channel: `${result.provider}_offboarding`,
        recipient_email: destEmail,
      });
    }
  } catch { /* */ }

  revalidatePath("/admin/payslips");
  return { ok: true, sent: true, sentTo: destEmail, provider: result.provider };
}

/**
 * Karim 2026-06-02 : helper - liste les fiches non payées pour un employee
 * (utile pour pré-cocher dans le dialog offboarding).
 */
export async function listPayslipsForEmployeeAction(employeeId: string): Promise<{
  ok: boolean;
  payslips: Array<{ id: string; period_label: string | null; period_year: number; period_month: number; net_amount: number; amount_to_pay: number; payment_status: string }>;
  employee: { id: string; full_name: string; email: string | null; contract_type: string | null; status: string } | null;
}> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, email, contract_type, status")
    .eq("id", employeeId)
    .maybeSingle();
  const { data: rows } = await admin
    .from("payslips")
    .select("id, period_label, period_year, period_month, net_amount, amount_to_pay, payment_status")
    .eq("employee_id", employeeId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(30);
  return {
    ok: true,
    employee: (emp ?? null) as { id: string; full_name: string; email: string | null; contract_type: string | null; status: string } | null,
    payslips: (rows ?? []) as Array<{ id: string; period_label: string | null; period_year: number; period_month: number; net_amount: number; amount_to_pay: number; payment_status: string }>,
  };
}

/**
 * Karim 2026-05-31 : bulk - envoie plusieurs fiches par mail séquentiellement.
 */
export async function sendPayslipsToEmployeesBulkAction(
  payslipIds: string[],
): Promise<{ ok: boolean; sent?: number; skipped?: number; errors?: string[] }> {
  await requireRole(["admin", "rh"]);
  if (payslipIds.length === 0) return { ok: false, errors: ["Aucune fiche selectionnée"] };
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const id of payslipIds) {
    try {
      const r = await sendPayslipToEmployeeAction(id);
      if (r.ok) sent++;
      else {
        skipped++;
        if (r.error) errors.push(`${id.slice(0, 8)}: ${r.error}`);
      }
    } catch (e) {
      skipped++;
      errors.push(`${id.slice(0, 8)}: ${(e as Error).message}`);
    }
  }
  return { ok: true, sent, skipped, errors };
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

  // Karim 2026-05-31 : watermark dynamique anti-fuite avant envoi.
  // On télécharge le PDF original, on tatoue (destinataire + date), on
  // upload sur un path partagé, et on signe sur cette version. Fallback
  // safe : si watermark échoue, on retombe sur le PDF original.
  let signedUrl: string | null = null;
  try {
    const { data: blob } = await admin.storage.from("payslips").download(payslip.pdf_storage_path);
    if (blob) {
      const origBytes = new Uint8Array(await blob.arrayBuffer());
      const { applyDynamicWatermark } = await import("@/lib/pdf-watermark");
      const wmBytes = await applyDynamicWatermark(origBytes, {
        recipientName: emp.full_name ?? destEmail,
        recipientEmail: destEmail,
        docRef: payslipId.slice(0, 8),
        diagonalText: "COPIE PERSONNELLE",
      });
      const wmPath = `${payslip.pdf_storage_path.replace(/\.pdf$/i, "")}__wm__${Date.now()}.pdf`;
      const up = await admin.storage
        .from("payslips")
        .upload(wmPath, wmBytes, { contentType: "application/pdf", upsert: true });
      if (!up.error) {
        const signedWm = await admin.storage.from("payslips").createSignedUrl(wmPath, 30 * 24 * 3600);
        if (signedWm.data?.signedUrl) signedUrl = signedWm.data.signedUrl;
      }
    }
  } catch (e) {
    console.warn("[sendPayslipToEmployeeAction] watermark fallback:", (e as Error).message);
  }
  // Karim 2026-06-03 : signed URL Supabase 30 jours, INDEPENDANT du tunnel.
  // (Avant : on enrobait dans /api/docs/view/<token> mais ce lien dependait
  // du tunnel qui rotate quotidien → liens cassés pour les destinataires.)
  // Trade-off : on perd le tracking de view individuelle (logDocAudit
  // share_email reste log au moment de l envoi pour audit basique).
  if (!signedUrl) {
    const { data: signed } = await admin.storage
      .from("payslips")
      .createSignedUrl(payslip.pdf_storage_path, 30 * 24 * 3600);
    if (!signed?.signedUrl) return { ok: false, error: "Impossible de generer URL PDF" };
    signedUrl = signed.signedUrl;
  }
  const signed = { signedUrl };

  // Envoi via sendAppMail
  const { sendAppMail } = await import("@/lib/app-mail");

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

  const mailResult = await sendAppMail({
    to: destEmail,
    toName: emp.full_name ?? destEmail,
    subject: m.subject,
    body: m.body,
    attachmentUrls: [{ name: payslip.pdf_filename ?? "Fiche de paie", url: signed.signedUrl }],
    source: "payslip_share",
    sourceRef: payslipId,
    employeeId: payslip.employee_id,
  });
  if (!mailResult.ok) return { ok: false, error: mailResult.error ?? "Echec envoi mail" };

  // Karim 2026-06-16 : outbound_mails déjà journalisé par sendAppMail.
  // audit log dédié (document_audit_log)
  try {
    const { logDocAudit } = await import("@/lib/document-audit-log");
    await logDocAudit({
      employee_id: payslip.employee_id,
      doc_type: "payslip",
      doc_ref: payslipId,
      doc_label: `Fiche de paie ${payslip.period_label ?? ""}`.trim(),
      action: "share_email",
      channel: "app_mail",
      actor_profile_id: null,
      recipient_email: destEmail,
      signed_url_path: payslip.pdf_storage_path,
      notes: recipientEmail && recipientEmail !== emp.email ? "Envoyé à un destinataire externe" : null,
    });
  } catch {}

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
  // Karim 2026-06-15 : on récupère aussi le nom + période pour NOMMER le fichier
  // téléchargé proprement (sinon le navigateur prend l'URL signée Supabase,
  // illisible « pleindecaracteres.supabase… »).
  const { data: payslip } = await admin
    .from("payslips")
    .select("pdf_storage_path, period_year, period_month, payment_holder_name, employee:employees(full_name)")
    .eq("id", payslipId)
    .single();
  if (!payslip?.pdf_storage_path) return { ok: false, error: "PDF introuvable" };
  const p = payslip as unknown as {
    pdf_storage_path: string;
    period_year: number | null;
    period_month: number | null;
    payment_holder_name: string | null;
    employee: { full_name: string | null } | null;
  };
  const name = p.employee?.full_name ?? p.payment_holder_name ?? "employe";
  const slug =
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") ||
    "employe";
  const period =
    p.period_year && p.period_month ? `_${p.period_year}-${String(p.period_month).padStart(2, "0")}` : "";
  const filename = `Fiche_de_paie_${slug}${period}.pdf`;
  const { data } = await admin.storage
    .from("payslips")
    .createSignedUrl(payslip.pdf_storage_path, 3600, { download: filename });
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
/**
 * Karim 2026-06-03 : declenche manuellement le sync IMAP fiches de paie
 * depuis hr@caftanfactory.com (test admin sans attendre le cron).
 */
export async function triggerImapPayslipsSyncAction(): Promise<{
  ok: boolean;
  error?: string;
  fetched?: number;
  matched?: number;
  processed?: number;
  pdfs_total?: number;
  payslips_inserted?: number;
  payslips_matched_employee?: number;
  payslips_orphan?: number;
  errors?: Array<{ uid?: number; subject?: string; error: string }>;
  details?: Array<{ uid: number; subject: string; from: string; employer: string | null; pdf_count: number; inserted: number; matched: number; orphan: number }>;
}> {
  await requireRole(["admin", "rh"]);
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { ok: false, error: "GMAIL_USER + GMAIL_APP_PASSWORD non configurés dans .env.local (compte hr@caftanfactory.com)" };
  }
  try {
    const { pollPayslipsFromImap } = await import("@/lib/inbound/payslip-imap-poller");
    const result = await pollPayslipsFromImap();
    revalidatePath("/admin/payslips");
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listActiveEmployeesAction(): Promise<
  Array<{ id: string; full_name: string; iban: string | null; status: string; email: string | null; contract_type: string | null }>
> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  // Karim 2026-06-02 : retourne aussi email + contract_type. Le offboarding
  // dialog en a besoin pour eviter le faux warning "pas d'email" + auto-pick
  // du template selon contract_type.
  const { data } = await admin
    .from("employees")
    .select("id, full_name, iban, status, email, contract_type")
    .in("status", ["active", "on_leave"])
    .order("full_name");
  return (data ?? []) as Array<{ id: string; full_name: string; iban: string | null; status: string; email: string | null; contract_type: string | null }>;
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
