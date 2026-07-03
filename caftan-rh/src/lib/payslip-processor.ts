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
import { splitPayslipPdf, matchEmployee, detectEmployeeIban, detectEmployerFromText, type EmployeeBd } from "@/lib/payslip-splitter";
import { generateEpcQr, defaultSalaryRemittance } from "@/lib/qr-epc";

export interface ProcessBatchInput {
  pdfBytes: Uint8Array;
  filename: string;
  employerOrgKey: "amd_megastore" | "caftan_factory";
  uploadedBy: string | null;   // profile.id ; null = auto/cron (poller IMAP)
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

    // Load employees pool for matching.
    // Karim 2026-07-03 : TOUS les employés (actifs ET archivés). Un ex-employé en
    // fin de contrat reçoit encore ses dernières fiches de paie ; restreindre aux
    // actifs les rendait systématiquement orphelines (ex. Nihad Loulichki, dont le
    // NISS correspondait pourtant exactement).
    const { data: empRows } = await admin
      .from("employees")
      .select("id, full_name, nrn, email, iban, bic, salary_advance_amount, preferred_language");
    const employees = (empRows ?? []) as Array<EmployeeBd & {
      email: string | null;
      iban: string | null;
      bic: string | null;
      salary_advance_amount: number | null;
      preferred_language: string | null;
    }>;

    const processed: ProcessedPayslip[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let insertedCount = 0;
    const debugLog: string[] = [];
    debugLog.push(`Splitter detected ${groups.length} groups`);
    debugLog.push(`Pool employees (actifs + archivés) : ${employees.length}`);
    // Karim 2026-05-30 : sample texte page 1 + fin de page pour diagnostic
    if (groups[0]?.rawText) {
      const rt = groups[0].rawText.replace(/\s+/g, " ");
      debugLog.push(`\n--- SAMPLE debut (300 chars) ---`);
      debugLog.push(rt.slice(0, 300));
      debugLog.push(`--- SAMPLE FIN (last 400 chars) ---`);
      debugLog.push(rt.slice(-400));
      debugLog.push(`---`);
    }

    // 4. Process each group
    for (const g of groups) {
      const matched = matchEmployee(g.employeeNameRaw, g.niss, employees);
      // Karim 2026-06-15 : EMPLOYEUR détecté du CONTENU de la fiche (Caftan vs AMD),
      // fallback sur l'employeur du batch si indéterminé. Corrige les fiches Caftan
      // qui étaient à tort attribuées à AMD (selon l'expéditeur du mail).
      const groupEmployer = detectEmployerFromText(g.rawText) ?? input.employerOrgKey;
      if (groupEmployer !== input.employerOrgKey) {
        debugLog.push(`  -> employeur détecté du contenu : ${groupEmployer} (batch=${input.employerOrgKey})`);
      }
      // Karim 2026-05-30 : on cree TOUJOURS la payslip, meme si unmatched.
      // L UI affiche les orphelines avec un bouton "Associer manuellement".
      if (!matched) {
        unmatchedCount++;
        debugLog.push(`p${g.pageRange[0]}-${g.pageRange[1]} : UNMATCHED nom='${g.employeeNameRaw ?? "null"}' niss='${g.niss ?? "null"}' net=${g.netAmount ?? "null"} -> orpheline cree`);
      } else {
        matchedCount++;
        debugLog.push(`p${g.pageRange[0]}-${g.pageRange[1]} : MATCHED '${g.employeeNameRaw}' -> ${matched.full_name} (id ${matched.id.slice(0, 8)}) net=${g.netAmount ?? "null"} period=${g.periodMonth}/${g.periodYear}`);
      }
      const emp = matched ? employees.find((e) => e.id === matched.id)! : null;
      const advance = emp ? Number(emp.salary_advance_amount ?? 0) : 0;
      const net = g.netAmount ?? 0;
      const periodMonth = g.periodMonth ?? new Date().getMonth() + 1;
      const periodYear = g.periodYear ?? new Date().getFullYear();

      // Karim 2026-05-30 : extrait IBAN beneficiaire du PDF (FORMULE DE PAIEMENT BE...)
      // et l auto-set sur employees.iban s il est vide en BD.
      const pdfIban = g.rawText ? detectEmployeeIban(g.rawText) : null;
      if (pdfIban && emp && !emp.iban) {
        await admin.from("employees").update({ iban: pdfIban }).eq("id", emp.id);
        emp.iban = pdfIban;
        debugLog.push(`  -> IBAN auto-saved on employee ${emp.full_name}: ${pdfIban}`);
      }
      const effectiveIban = emp?.iban ?? pdfIban ?? null;
      const effectiveHolder = emp?.full_name ?? g.employeeNameRaw ?? null;

      // Detect double fiche : existe-t-il deja une payslip pour cet employee + mois ?
      // (skip pour les orphelines : pas de matching periode/employee possible)
      const { data: existing } = emp ? await admin
        .from("payslips")
        .select("id, net_amount, is_secondary")
        .eq("employee_id", emp.id)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth) : { data: [] as Array<{ id: string; net_amount: number; is_secondary: boolean }> };

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
          // L'autre est secondaire (la plus petite) -> on doit la flagger.
          // Karim 2026-07-03 : une secondaire ne déduit JAMAIS d'avance -> on
          // remet son avance à 0 + amount_to_pay = net + on annule son QR (il
          // encodait net-avance, périmé). Sinon avance fantôme sur la secondaire.
          await admin
            .from("payslips")
            .update({
              is_secondary: true,
              paired_with_payslip_id: null,  // sera setté juste apres
              scheduled_payment_date: computeScheduledDate(periodYear, periodMonth, 6),
              advance_deducted: 0,
              amount_to_pay: otherNet,
              qr_epc_payload: null,
              qr_png_data_url: null,
            })
            .eq("id", other.id);
          pairedWith = other.id;
        }
      }

      // Deduit avance (uniquement pour la fiche principale, pas la secondaire)
      const advanceDeducted = isSecondary ? 0 : Math.min(advance, net);
      const amountToPay = Math.max(0, net - advanceDeducted);

      // Genere QR EPC (utilise IBAN BD ou IBAN extrait du PDF)
      let qrPayload: string | null = null;
      let qrPng: string | null = null;
      const shouldGenerateQr = !isSecondary || (scheduledPaymentDate && scheduledPaymentDate <= todayISO());
      if (shouldGenerateQr && effectiveIban && effectiveHolder && amountToPay > 0) {
        const lang = (emp?.preferred_language ?? "fr") as "fr" | "nl" | "en";
        try {
          const epc = await generateEpcQr({
            beneficiaryName: effectiveHolder,
            iban: effectiveIban,
            bic: emp?.bic ?? undefined,
            amountEur: amountToPay,
            remittanceInfo: defaultSalaryRemittance(periodMonth, periodYear, lang),
            purposeCode: "SALA",
          });
          qrPayload = epc.payload;
          qrPng = epc.qrPngDataUrl;
          debugLog.push(`  -> QR genere pour ${effectiveHolder} (${effectiveIban})`);
        } catch (e) {
          console.error(`QR gen failed:`, e);
          debugLog.push(`  -> QR FAIL : ${(e as Error).message}`);
        }
      } else if (!effectiveIban) {
        debugLog.push(`  -> Pas de QR : IBAN absent (BD et PDF)`);
      }

      // Karim 2026-05-30 : DEDUP - cherche si une fiche existe deja pour la
      // meme periode + meme montant + meme employee (ou meme IBAN PDF si orpheline).
      // Si trouvee : MISE A JOUR (preserve avance/statut paye/asso manuelle).
      // Sinon : INSERT normal.
      type DuplicateRow = {
        id: string;
        employee_id: string | null;
        advance_deducted: number;
        payment_status: string;
        paid_at: string | null;
        paid_amount: number | null;
        payment_note: string | null;
        pdf_storage_path: string | null;
      };
      let duplicate: DuplicateRow | null = null;
      if (emp?.id) {
        const { data } = await admin
          .from("payslips")
          .select("id, employee_id, advance_deducted, payment_status, paid_at, paid_amount, payment_note, pdf_storage_path")
          .eq("employee_id", emp.id)
          .eq("period_year", periodYear)
          .eq("period_month", periodMonth)
          .eq("net_amount", net)
          .eq("is_secondary", isSecondary)
          .limit(1);
        if (data && data.length > 0) duplicate = data[0] as DuplicateRow;
      } else if (pdfIban) {
        const { data } = await admin
          .from("payslips")
          .select("id, employee_id, advance_deducted, payment_status, paid_at, paid_amount, payment_note, pdf_storage_path")
          .eq("payment_iban", pdfIban)
          .eq("period_year", periodYear)
          .eq("period_month", periodMonth)
          .eq("net_amount", net)
          .eq("is_secondary", isSecondary)
          .limit(1);
        if (data && data.length > 0) duplicate = data[0] as DuplicateRow;
      }

      // Upload PDF chunk -> Storage
      const slug = emp ? slugify(emp.full_name) : `orphan-p${g.pageRange[0]}`;
      const chunkPath = `${groupEmployer}/${periodYear}-${String(periodMonth).padStart(2, "0")}/${slug}_${batchId.slice(0, 8)}.pdf`;
      await admin.storage.from(BUCKET_PAYSLIPS).upload(chunkPath, g.pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

      // Si DOUBLON : UPDATE en preservant les decisions (avance + paiement +
      // assoc. manuelle). Supprime l ancien PDF storage du duplicate.
      if (duplicate) {
        const preservedAdvance = Number(duplicate.advance_deducted);
        const preservedPaid = duplicate.payment_status === "paid";
        // Recalcule amount_to_pay si pas paye (sinon on garde tel quel)
        const newAmountToPay = preservedPaid
          ? amountToPay
          : Math.max(0, net - preservedAdvance);
        // employee_id : garde celui existant si pas detecte ce coup-ci
        const finalEmployeeId = emp?.id ?? duplicate.employee_id;

        // Karim 2026-07-03 : REGENERE le QR sur newAmountToPay (avance PRESERVEE),
        // pas sur qrPayload (calcule sur l'avance COURANTE) -> sinon le QR encode un
        // montant != amount_to_pay stocke = surpaiement au scan.
        let dupQrPayload: string | null = null;
        let dupQrPng: string | null = null;
        if (!preservedPaid && effectiveIban && effectiveHolder && newAmountToPay > 0) {
          try {
            const epc = await generateEpcQr({
              beneficiaryName: effectiveHolder,
              iban: effectiveIban,
              bic: emp?.bic ?? undefined,
              amountEur: newAmountToPay,
              remittanceInfo: defaultSalaryRemittance(periodMonth, periodYear, (emp?.preferred_language ?? "fr") as "fr" | "nl" | "en"),
              purposeCode: "SALA",
            });
            dupQrPayload = epc.payload;
            dupQrPng = epc.qrPngDataUrl;
          } catch (e) {
            debugLog.push(`  -> DEDUP QR FAIL : ${(e as Error).message}`);
          }
        }
        await admin.from("payslips").update({
          employee_id: finalEmployeeId,
          employer_org_key: groupEmployer,
          period_label: defaultSalaryRemittance(periodMonth, periodYear, "fr").replace(/^Salaire\s+/i, ""),
          gross_amount: g.grossAmount,
          // PRESERVE : advance_deducted, payment_status, paid_at, paid_amount, payment_note
          amount_to_pay: newAmountToPay,
          pdf_storage_path: chunkPath,
          pdf_filename: emp
            ? `Fiche_paie_${slug}_${periodYear}-${String(periodMonth).padStart(2, "0")}.pdf`
            : `Orphan_p${g.pageRange[0]}-${g.pageRange[1]}_${periodYear}-${String(periodMonth).padStart(2, "0")}.pdf`,
          source_batch_id: batchId,
          qr_epc_payload: preservedPaid ? null : dupQrPayload,
          qr_png_data_url: preservedPaid ? null : dupQrPng,
          scheduled_payment_date: scheduledPaymentDate,
          paired_with_payslip_id: pairedWith,
          hrconsult_doc_ref: finalEmployeeId ? null : (g.employeeNameRaw ? `Nom detecte: ${g.employeeNameRaw}` : "Nom non detecte"),
          payment_iban: pdfIban ?? null,
          payment_holder_name: effectiveHolder,
        }).eq("id", duplicate.id);
        // Cleanup ancien PDF storage (si different du nouveau path)
        if (duplicate.pdf_storage_path && duplicate.pdf_storage_path !== chunkPath) {
          await admin.storage.from(BUCKET_PAYSLIPS).remove([duplicate.pdf_storage_path]);
        }
        insertedCount++;
        debugLog.push(`  -> DEDUP : fusionne avec payslip ${duplicate.id.slice(0, 8)} (paye=${preservedPaid}, avance preservee=${preservedAdvance})`);
        processed.push({
          payslipId: duplicate.id,
          employeeId: finalEmployeeId,
          employeeName: emp?.full_name ?? g.employeeNameRaw,
          pageRange: g.pageRange,
          netAmount: net,
          advanceDeducted: preservedAdvance,
          amountToPay: newAmountToPay,
          isSecondary,
          scheduledPaymentDate,
          matched: !!finalEmployeeId,
        });
        continue;
      }

      // Sinon : INSERT normal (employee_id null si orpheline)
      const { data: payslipRow, error: psErr } = await admin
        .from("payslips")
        .insert({
          employee_id: emp?.id ?? null,
          employer_org_key: groupEmployer,
          period_year: periodYear,
          period_month: periodMonth,
          period_label: defaultSalaryRemittance(periodMonth, periodYear, "fr").replace(/^Salaire\s+/i, ""),
          gross_amount: g.grossAmount,
          net_amount: net,
          advance_deducted: advanceDeducted,
          amount_to_pay: amountToPay,
          pdf_storage_path: chunkPath,
          pdf_filename: emp
            ? `Fiche_paie_${slug}_${periodYear}-${String(periodMonth).padStart(2, "0")}.pdf`
            : `Orphan_p${g.pageRange[0]}-${g.pageRange[1]}_${periodYear}-${String(periodMonth).padStart(2, "0")}.pdf`,
          source_batch_id: batchId,
          qr_epc_payload: qrPayload,
          qr_png_data_url: qrPng,
          is_secondary: isSecondary,
          scheduled_payment_date: scheduledPaymentDate,
          paired_with_payslip_id: pairedWith,
          payment_status: isSecondary && scheduledPaymentDate && scheduledPaymentDate > todayISO() ? "scheduled" : "pending",
          hrconsult_doc_ref: emp ? null : (g.employeeNameRaw ? `Nom detecte: ${g.employeeNameRaw}` : "Nom non detecte"),
          payment_iban: pdfIban,
          payment_holder_name: effectiveHolder,
        })
        .select("id")
        .single();
      if (psErr || !payslipRow) {
        console.error("Payslip insert failed:", psErr);
        debugLog.push(`  -> INSERT FAILED : ${psErr?.message ?? "no row returned"}`);
        continue;
      }
      insertedCount++;
      debugLog.push(`  -> INSERTED payslip ${payslipRow.id.slice(0, 8)} amount_to_pay=${amountToPay}`);

      // Karim 2026-07-03 : avance CONSOMMÉE à l'import (décision). Dès qu'une fiche
      // déduit l'avance, on la remet à 0 sur l'employé -> jamais déduite deux fois
      // (ex. 2 mois impayés simultanés). Uniquement fiche principale + match réel.
      if (advanceDeducted > 0 && emp?.id && !isSecondary) {
        await admin
          .from("employees")
          .update({ salary_advance_amount: 0, salary_advance_updated_at: new Date().toISOString() })
          .eq("id", emp.id);
        debugLog.push(`  -> Avance ${advanceDeducted} consommee -> remise a 0 sur ${emp.full_name}`);
      }

      // Si on a paired et qu'on est la principale, set paired_with sur l autre
      if (pairedWith && !isSecondary) {
        await admin.from("payslips").update({ paired_with_payslip_id: payslipRow.id }).eq("id", pairedWith);
      }

      processed.push({
        payslipId: payslipRow.id,
        employeeId: emp?.id ?? null,
        employeeName: emp?.full_name ?? g.employeeNameRaw,
        pageRange: g.pageRange,
        netAmount: net,
        advanceDeducted,
        amountToPay,
        isSecondary,
        scheduledPaymentDate,
        matched: !!emp,
      });
    }

    // 5. Update batch status
    debugLog.push(`\n=== BILAN : ${insertedCount}/${groups.length} inseres, ${matchedCount} matched, ${unmatchedCount} unmatched ===`);
    await admin
      .from("payslip_batches")
      .update({
        status: insertedCount > 0 ? "completed" : "failed",
        payslips_count: insertedCount,
        total_pages: groups.reduce((sum, g) => sum + (g.pageRange[1] - g.pageRange[0] + 1), 0),
        completed_at: new Date().toISOString(),
        error_message: debugLog.join("\n"),
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
