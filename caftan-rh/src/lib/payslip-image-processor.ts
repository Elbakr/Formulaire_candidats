// Karim 2026-06-15 : ingestion de fiches de paie reçues en IMAGE (JPEG/PNG)
// via OCR Claude vision. Produit le même résultat qu'un lot PDF ordinaire :
// match employé, calcul avance/amount_to_pay, QR EPC, insert payslip.
//
// GARDE-FOU ARGENT : toute fiche issue de l'OCR reste en statut "pending"
// avec une note "OCR image — vérifier les montants". Jamais de paiement auto.

import "server-only";
import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/server";
import { callAnthropicVision } from "@/lib/ai/providers/anthropic";
import {
  matchEmployee,
  detectEmployeeIban,
  detectEmployerFromText,
  type EmployeeBd,
} from "@/lib/payslip-splitter";
import { generateEpcQr, defaultSalaryRemittance } from "@/lib/qr-epc";

const BUCKET_BATCHES = "payslip-batches";
const BUCKET_PAYSLIPS = "payslips";
// Modèle vision-capable — même que model_strong du projet (claude-sonnet-4-6)
const VISION_MODEL = "claude-sonnet-4-6";
// Note OCR apposée sur chaque payslip issu d'une image
const OCR_NOTE = "OCR image — vérifier les montants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OcrPayslipData {
  employer: "amd_megastore" | "caftan_factory" | null;
  employee_name: string | null;
  niss: string | null;
  period_month: number | null;  // 1-12
  period_year: number | null;
  gross: number | null;
  net: number | null;
  iban: string | null;
}

export interface ProcessImagePayslipInput {
  imageBytes: Uint8Array;
  mediaType: string;            // "image/jpeg" | "image/png" | "image/webp"
  filename: string;
  fallbackEmployer: "amd_megastore" | "caftan_factory";
  uploadedBy: string | null;    // profile.id ; null = auto/cron
  source?: "manual_upload" | "hrconsult_portal" | "email";
}

export interface ProcessImagePayslipResult {
  payslipId: string | null;
  employeeId: string | null;
  matched: boolean;
  employer: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// OCR via Claude vision
// ---------------------------------------------------------------------------

const SYSTEM_OCR = `Tu es un assistant OCR spécialisé en fiches de paie belges.
Les employeurs sont AMD Megastore SRL ou Caftan Factory SRL.
Les secrétariats sociaux courants : HR Consult, Partena, Securex, Acerta, Group S.
Réponds UNIQUEMENT avec un objet JSON, sans commentaire ni markdown.`;

const USER_OCR = `Analyse cette fiche de paie belge et extrais les champs suivants.
Règles :
- employer : "amd_megastore" si AMD Megastore figure dans la fiche, "caftan_factory" si Caftan Factory, null si indéterminé.
- employee_name : nom complet du travailleur (NOM Prénom) tel qu'il apparaît.
- niss : numéro de registre national belge (format YY.MM.DD-XXX.XX ou 11 chiffres bruts).
- period_month : mois de paie (entier 1-12).
- period_year : année de paie (entier, ex. 2026).
- gross : montant brut soumis ONSS (nombre décimal, point comme séparateur, ex. 1234.56). null si absent.
- net : montant NET À PAYER au travailleur (nombre décimal). C'est le montant réellement versé sur son compte. null si absent.
- iban : IBAN du compte bénéficiaire (format BExx xxxx xxxx xxxx), null si absent.

Réponds avec ce JSON exact :
{"employer":null,"employee_name":null,"niss":null,"period_month":null,"period_year":null,"gross":null,"net":null,"iban":null}`;

async function ocrPayslipImage(
  imageBytes: Uint8Array,
  mediaType: string,
): Promise<OcrPayslipData> {
  const safeMediaType = (
    mediaType === "image/jpeg" || mediaType === "image/png" || mediaType === "image/webp"
      ? mediaType
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/webp";

  const base64 = Buffer.from(imageBytes).toString("base64");

  const result = await callAnthropicVision({
    model: VISION_MODEL,
    system: SYSTEM_OCR,
    user: USER_OCR,
    images: [{ mediaType: safeMediaType, base64 }],
    expectsJson: true,
    maxTokens: 800,
  });

  const data = result.output as Partial<OcrPayslipData>;
  return {
    employer: data.employer ?? null,
    employee_name: data.employee_name ?? null,
    niss: data.niss ?? null,
    period_month: typeof data.period_month === "number" ? data.period_month : null,
    period_year: typeof data.period_year === "number" ? data.period_year : null,
    gross: typeof data.gross === "number" ? data.gross : null,
    net: typeof data.net === "number" ? data.net : null,
    iban: data.iban ?? null,
  };
}

// ---------------------------------------------------------------------------
// Conversion image → PDF 1-page (pour stockage + téléchargement travailleur)
// ---------------------------------------------------------------------------

async function imageToPdf(imageBytes: Uint8Array, mediaType: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let img;
  if (mediaType === "image/png") {
    img = await doc.embedPng(imageBytes);
  } else {
    // jpeg + webp → embedJpg (webp n'est pas supporté nativement par pdf-lib,
    // on essaie jpeg en fallback — la fiche reste lisible dans tous les cas)
    img = await doc.embedJpg(imageBytes);
  }
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return doc.save();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Processeur principal
// ---------------------------------------------------------------------------

export async function processImagePayslip(
  input: ProcessImagePayslipInput,
): Promise<ProcessImagePayslipResult> {
  const admin = createAdminClient();
  const source = input.source ?? "email";

  try {
    // 1. OCR via Claude vision
    let ocr: OcrPayslipData;
    try {
      ocr = await ocrPayslipImage(input.imageBytes, input.mediaType);
    } catch (e) {
      return {
        payslipId: null,
        employeeId: null,
        matched: false,
        employer: input.fallbackEmployer,
        error: `OCR échoué : ${(e as Error).message}`,
      };
    }

    // 2. Employer : contenu OCR > fallback
    const detectedFromText = detectEmployerFromText(
      [ocr.employer, ocr.employee_name].filter(Boolean).join(" "),
    );
    const finalEmployer: "amd_megastore" | "caftan_factory" =
      ocr.employer ?? detectedFromText ?? input.fallbackEmployer;

    // 3. Conversion image → PDF pour stockage
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await imageToPdf(input.imageBytes, input.mediaType);
    } catch (e) {
      return {
        payslipId: null,
        employeeId: null,
        matched: false,
        employer: finalEmployer,
        error: `Conversion image→PDF échouée : ${(e as Error).message}`,
      };
    }

    // 4. Crée un batch row (source="email", status=completed après insert)
    const batchStoragePath = `${finalEmployer}/${Date.now()}_${sanitizeFilename(input.filename)}.pdf`;
    await admin.storage.from(BUCKET_BATCHES).upload(batchStoragePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

    const { data: batchRow } = await admin
      .from("payslip_batches")
      .insert({
        employer_org_key: finalEmployer,
        source,
        source_filename: input.filename,
        uploaded_by: input.uploadedBy,
        pdf_storage_path: batchStoragePath,
        status: "processing",
      })
      .select("id")
      .single();
    const batchId = (batchRow?.id as string | undefined) ?? `img-${Date.now()}`;

    // 5. Charge les employees actifs
    const { data: empRows } = await admin
      .from("employees")
      .select("id, full_name, nrn, email, iban, bic, salary_advance_amount, preferred_language")
      .eq("status", "active");
    const employees = (empRows ?? []) as Array<
      EmployeeBd & {
        email: string | null;
        iban: string | null;
        bic: string | null;
        salary_advance_amount: number | null;
        preferred_language: string | null;
      }
    >;

    // 6. Match employé
    const matched = matchEmployee(ocr.employee_name, ocr.niss, employees);
    const emp = matched ? employees.find((e) => e.id === matched.id) ?? null : null;

    // 7. Période + montants
    const periodMonth = ocr.period_month ?? new Date().getMonth() + 1;
    const periodYear = ocr.period_year ?? new Date().getFullYear();
    const net = ocr.net ?? 0;
    const gross = ocr.gross ?? null;

    // 8. IBAN : OCR > employee BD (auto-save si manquant)
    const ocrIban = ocr.iban ? detectEmployeeIban(ocr.iban) ?? ocr.iban : null;
    if (ocrIban && emp && !emp.iban) {
      await admin.from("employees").update({ iban: ocrIban }).eq("id", emp.id);
      emp.iban = ocrIban;
    }
    const effectiveIban = emp?.iban ?? ocrIban ?? null;
    const effectiveHolder = emp?.full_name ?? ocr.employee_name ?? null;

    // 9. Avance + amount_to_pay
    const advance = emp ? Number(emp.salary_advance_amount ?? 0) : 0;
    const advanceDeducted = Math.min(advance, net);
    const amountToPay = Math.max(0, net - advanceDeducted);

    // 10. QR EPC (si IBAN + montant > 0)
    let qrPayload: string | null = null;
    let qrPng: string | null = null;
    if (effectiveIban && effectiveHolder && amountToPay > 0) {
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
      } catch {
        // QR non bloquant
      }
    }

    // 11. Dedup : employee_id + period_year + period_month + net_amount
    type DuplicateRow = { id: string; employee_id: string | null; payment_status: string };
    let duplicate: DuplicateRow | null = null;
    if (emp?.id && net > 0) {
      const { data } = await admin
        .from("payslips")
        .select("id, employee_id, payment_status")
        .eq("employee_id", emp.id)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth)
        .eq("net_amount", net)
        .limit(1);
      if (data && data.length > 0) duplicate = data[0] as DuplicateRow;
    }

    // 12. Upload PDF dans bucket payslips
    const slug = emp ? slugify(emp.full_name) : "orphan-ocr";
    const chunkPath = `${finalEmployer}/${periodYear}-${String(periodMonth).padStart(2, "0")}/${slug}_ocr_${Date.now()}.pdf`;
    await admin.storage.from(BUCKET_PAYSLIPS).upload(chunkPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    const periodLabel = defaultSalaryRemittance(periodMonth, periodYear, "fr").replace(/^Salaire\s+/i, "");
    const pdfFilename = emp
      ? `Fiche_paie_${slug}_${periodYear}-${String(periodMonth).padStart(2, "0")}_OCR.pdf`
      : `Orphan_OCR_${periodYear}-${String(periodMonth).padStart(2, "0")}_${Date.now()}.pdf`;

    // 13. Dedup → UPDATE, sinon INSERT
    // GARDE-FOU : payment_status toujours "pending", note OCR toujours présente
    let payslipId: string;

    if (duplicate) {
      await admin
        .from("payslips")
        .update({
          employee_id: emp?.id ?? duplicate.employee_id,
          employer_org_key: finalEmployer,
          period_label: periodLabel,
          gross_amount: gross,
          amount_to_pay: amountToPay,
          advance_deducted: advanceDeducted,
          pdf_storage_path: chunkPath,
          pdf_filename: pdfFilename,
          source_batch_id: batchId,
          qr_epc_payload: qrPayload,
          qr_png_data_url: qrPng,
          payment_status: "pending",        // GARDE-FOU : jamais paiement auto
          payment_note: OCR_NOTE,           // GARDE-FOU : note humain requis
          hrconsult_doc_ref: emp ? null : (ocr.employee_name ? `Nom OCR: ${ocr.employee_name}` : "Nom non détecté"),
          payment_iban: effectiveIban,
          payment_holder_name: effectiveHolder,
        })
        .eq("id", duplicate.id);
      payslipId = duplicate.id;
    } else {
      const { data: psRow, error: psErr } = await admin
        .from("payslips")
        .insert({
          employee_id: emp?.id ?? null,
          employer_org_key: finalEmployer,
          period_year: periodYear,
          period_month: periodMonth,
          period_label: periodLabel,
          gross_amount: gross,
          net_amount: net,
          advance_deducted: advanceDeducted,
          amount_to_pay: amountToPay,
          pdf_storage_path: chunkPath,
          pdf_filename: pdfFilename,
          source_batch_id: batchId,
          qr_epc_payload: qrPayload,
          qr_png_data_url: qrPng,
          is_secondary: false,
          payment_status: "pending",        // GARDE-FOU : jamais paiement auto
          payment_note: OCR_NOTE,           // GARDE-FOU : note humain requis
          hrconsult_doc_ref: emp ? null : (ocr.employee_name ? `Nom OCR: ${ocr.employee_name}` : "Nom non détecté"),
          payment_iban: effectiveIban,
          payment_holder_name: effectiveHolder,
        })
        .select("id")
        .single();
      if (psErr || !psRow) {
        // Mise à jour du batch en échec
        await admin.from("payslip_batches").update({
          status: "failed",
          error_message: psErr?.message ?? "insert sans retour",
          completed_at: todayISO(),
        }).eq("id", batchId);
        return {
          payslipId: null,
          employeeId: emp?.id ?? null,
          matched: !!emp,
          employer: finalEmployer,
          error: `Insert payslip échoué : ${psErr?.message ?? "no row"}`,
        };
      }
      payslipId = psRow.id as string;
    }

    // 14. Met à jour le batch en completed
    await admin.from("payslip_batches").update({
      status: "completed",
      payslips_count: 1,
      total_pages: 1,
      completed_at: new Date().toISOString(),
      error_message: `OCR image. Employeur=${finalEmployer}, Employé=${ocr.employee_name ?? "inconnu"}, Net=${net}, Matched=${!!emp}`,
    }).eq("id", batchId);

    return {
      payslipId,
      employeeId: emp?.id ?? null,
      matched: !!emp,
      employer: finalEmployer,
    };
  } catch (e) {
    return {
      payslipId: null,
      employeeId: null,
      matched: false,
      employer: input.fallbackEmployer,
      error: `Erreur inattendue : ${(e as Error).message}`,
    };
  }
}
