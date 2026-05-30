// Karim 2026-05-29 : orchestrate le pipeline complet d un PDF groupe de
// fiches de paie vers N payslips en BD avec QR EPC genere.
//
// Workflow :
//   1. Upload PDF groupe -> Supabase Storage (bucket payslip-batches)
//   2. Cree payslip_batches row (status='processing')
//   3. Split via payslip-splitter.splitPayslipPdf()
//   4. Pour chaque groupe :
//      a. Match employee BD (NISS prioritaire, sinon nom)
//      b. Calcule advance_deducted + amount_to_pay
//      c. Detecte double fiche (autre payslip meme mois)
//      d. Genere QR EPC SEPA (si is_secondary=false ou scheduled_payment_date<=today)
//      e. Upload PDF chunk -> Supabase Storage (bucket payslips)
//      f. Insert payslip row
//   5. Update payslip_batches.status='completed' + payslips_count

import { createAdminClient } from "@/lib/supabase/server";
import { splitPayslipPdf, matchEmployee, type SplitPayslipResult, type EmployeeBd } from "@/lib/payslip-splitter";
import { generateEpcQr, defaultSalaryRemittance } from "@/lib/qr-epc";

export interface ProcessBatchInput {
  pdfBytes: Uint8Array;
  filename: string;
  employerOrgKey: "amd_megastore" | "caftan_factory";
  uploadedBy: string;          // profile.id
  source?: "manual_upload" | "hrconsult_portal" | "email";
}

export interface ProcessedPayslip {
  payslipId: string;
  employeeId: string | null;
  employeeName: string | null;
  pageRange: [number, number];
  netAmount: number | null;
  advanceDeducted: number;
  amountToPay: number;
  isSecondary: boolean;
  scheduledPaymentDate: string | null;
  matched: boolean;
}

export interface ProcessBatchResult {
  batchId: string;
  totalGroups: number;
  matchedCount: number;
  unmatchedCount: number;
  payslips: ProcessedPayslip[];
}

const BUCKET_BATCHES = "payslip-batches";
const BUCKET_PAYSLIPS = "payslips";

export async function processBatch(input: ProcessBatchInput): Promise<ProcessBatchResult> {
  const admin = createAdminClient();
  const source = input.source ?? "manual_upload";

  // 1. Upload PDF groupe original -> Storage
  const batchStoragePath = `${input.employerOrgKey}/${Date.now()}_${sanitizeFilename(input.filename)}`;
  const { error: upErr } = await admin.storage.from(BUCKET_BATCHES).upload(batchStoragePath, input.pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  // 2. Cree batch row
  const { data: batchRow, error: batchErr } = await admin
    .from("payslip_batches")
    .insert({
      employer_org_key: input.employerOrgKey,
      source,
      source_filename: input.filename,
      uploaded_by: input.uploadedBy,
      pdf_storage_path: batchStoragePath,
      status: "processing",
    })
    .select("id")
    .single();
  if (batchErr || !batchRow) throw new Error(`Batch insert failed: ${batchErr?.message}`);
  const batchId = batchRow.id as string;

  try {
    // 3. Split PDF
    const groups = await splitPayslipPdf(input.pdfBytes);

    // Load employees pool for matching
    const { data: empRows } = await admin
      .from("employees")
      .select("id, full_name, nrn, email, iban, bic, salary_advance_amount, preferred_language")
      .eq("status", "active");
    const employees = (empRows ?? []) as Array<EmployeeBd & {
      email: string | null;
      iban: string | null;
      bic: string | null;
      salary_advance_amount: number | null;
      preferred_language: string | null;
    }>;

    // Load employer bank account (for QR sender info - currently not used in EPC but for reference)
    const { data: bankRows } = await admin
      .from("employer_bank_accounts")
      .select("holder_name, iban, bic")
      .eq("employer_org_key", input.employerOrgKey)
      .eq("is_default", true)
      .limit(1);
    const bankAccount = bankRows?.[0];

    const processed: ProcessedPayslip[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    // 4. Process each group
    for (const g of groups) {
      const matched = matchEmployee(g.employeeNameRaw, g.niss, employees);
      if (!matched) {
        unmatchedCount++;
        processed.push({
          payslipId: "",
          employeeId: null,
          employeeName: g.employeeNameRaw,
          pageRange: g.pageRange,
          netAmount: g.netAmount,
          advanceDeducted: 0,
          amountToPay: g.netAmount ?? 0,
          isSecondary: false,
          scheduledPaymentDate: null,
          matched: false,
        });
        continue;
      }
      matchedCount++;
      const emp = employees.find((e) => e.id === matched.id)!;
      const advance = Number(emp.salary_advance_amount ?? 0);
      const net = g.netAmount ?? 0;
      const periodMonth = g.periodMonth ?? new Date().getMonth() + 1;
      const periodYear = g.periodYear ?? new Date().getFullYear();

      // Detect double fiche : existe-t-il deja une payslip pour cet employee + mois ?
      const { data: existing } = await admin
        .from("payslips")
        .select("id, net_amount, is_secondary")
        .eq("employee_id", emp.id)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth);

      let isSecondary = false;
      let pairedWith: string | null = null;
      let scheduledPaymentDate: string | null = null;

      if (existing && existing.length > 0) {
        // Une payslip existe deja ce mois -> regle "plus petite = secondaire differee j+6"
        const other = existing[0];
        const otherNet = Number(other.net_amount);
        if (net < otherNet) {
          isSecondary = true;
          pairedWith = other.id;
          scheduledPaymentDate = computeScheduledDate(periodYear, periodMonth, 6);
        } else {
          // L'autre est secondaire (la plus petite) -> on doit la flagger
          await admin
            .from("payslips")
            .update({
              is_secondary: true,
              paired_with_payslip_id: null,  // sera setté juste apres
              scheduled_payment_date: computeScheduledDate(periodYear, periodMonth, 6),
            })
            .eq("id", other.id);
          pairedWith = other.id;
        }
      }

      // Deduit avance (uniquement pour la fiche principale, pas la secondaire)
      const advanceDeducted = isSecondary ? 0 : Math.min(advance, net);
      const amountToPay = Math.max(0, net - advanceDeducted);

      // Genere QR EPC (sauf si secondaire avec date future > today)
      let qrPayload: string | null = null;
      let qrPng: string | null = null;
      const shouldGenerateQr = !isSecondary || (scheduledPaymentDate && scheduledPaymentDate <= todayISO());
      if (shouldGenerateQr && emp.iban && amountToPay > 0) {
        const lang = (emp.preferred_language ?? "fr") as "fr" | "nl" | "en";
        try {
          const epc = await generateEpcQr({
            beneficiaryName: emp.full_name,
            iban: emp.iban,
            bic: emp.bic ?? undefined,
            amountEur: amountToPay,
            remittanceInfo: defaultSalaryRemittance(periodMonth, periodYear, lang),
            purposeCode: "SALA",
          });
          qrPayload = epc.payload;
          qrPng = epc.qrPngDataUrl;
        } catch (e) {
          console.error(`QR gen failed for ${emp.full_name}:`, e);
        }
      }

      // Upload PDF chunk -> Storage
      const chunkPath = `${input.employerOrgKey}/${periodYear}-${String(periodMonth).padStart(2, "0")}/${slugify(emp.full_name)}_${batchId.slice(0, 8)}.pdf`;
      await admin.storage.from(BUCKET_PAYSLIPS).upload(chunkPath, g.pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

      // Insert payslip row
      const { data: payslipRow, error: psErr } = await admin
        .from("payslips")
        .insert({
          employee_id: emp.id,
          employer_org_key: input.employerOrgKey,
          period_year: periodYear,
          period_month: periodMonth,
          period_label: defaultSalaryRemittance(periodMonth, periodYear, "fr").replace(/^Salaire\s+/i, ""),
          gross_amount: g.grossAmount,
          net_amount: net,
          advance_deducted: advanceDeducted,
          amount_to_pay: amountToPay,
          pdf_storage_path: chunkPath,
          pdf_filename: `Fiche_paie_${slugify(emp.full_name)}_${periodYear}-${String(periodMonth).padStart(2, "0")}.pdf`,
          source_batch_id: batchId,
          qr_epc_payload: qrPayload,
          qr_png_data_url: qrPng,
          is_secondary: isSecondary,
          scheduled_payment_date: scheduledPaymentDate,
          paired_with_payslip_id: pairedWith,
          payment_status: isSecondary && scheduledPaymentDate && scheduledPaymentDate > todayISO() ? "scheduled" : "pending",
        })
        .select("id")
        .single();
      if (psErr || !payslipRow) {
        console.error("Payslip insert failed:", psErr);
        continue;
      }

      // Si on a paired et qu'on est la principale, set paired_with sur l autre
      if (pairedWith && !isSecondary) {
        await admin.from("payslips").update({ paired_with_payslip_id: payslipRow.id }).eq("id", pairedWith);
      }

      processed.push({
        payslipId: payslipRow.id,
        employeeId: emp.id,
        employeeName: emp.full_name,
        pageRange: g.pageRange,
        netAmount: net,
        advanceDeducted,
        amountToPay,
        isSecondary,
        scheduledPaymentDate,
        matched: true,
      });
    }

    // 5. Update batch status
    await admin
      .from("payslip_batches")
      .update({
        status: "completed",
        payslips_count: processed.length,
        total_pages: groups.reduce((sum, g) => sum + (g.pageRange[1] - g.pageRange[0] + 1), 0),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    return {
      batchId,
      totalGroups: groups.length,
      matchedCount,
      unmatchedCount,
      payslips: processed,
    };
  } catch (e) {
    await admin
      .from("payslip_batches")
      .update({ status: "failed", error_message: (e as Error).message, completed_at: new Date().toISOString() })
      .eq("id", batchId);
    throw e;
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àâäáã]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/[ùûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Karim 2026-05-29 : calcule la date de paiement scheduled pour une fiche
// secondaire. Regle : period_end + minDays jours calendaires.
// Pour simplicite : aujourd'hui + minDays.
function computeScheduledDate(_year: number, _month: number, minDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  return d.toISOString().slice(0, 10);
}
