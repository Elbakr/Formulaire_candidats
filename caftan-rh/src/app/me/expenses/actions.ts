"use server";

import { requireUser, requireRole } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function submitExpenseAction(args: {
  amount: number;
  expenseDate: string;
  category: string;
  description?: string;
  vendor?: string;
  vatAmount?: number;
  receiptBase64?: string;
  receiptName?: string;
  receiptMime?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id").eq("profile_id", user.id).maybeSingle();
  if (!emp) return { ok: false, error: "Aucune fiche employé" };

  // Upload receipt si fourni
  let receiptPath: string | null = null;
  if (args.receiptBase64 && args.receiptName) {
    try {
      const bytes = new Uint8Array(Buffer.from(args.receiptBase64, "base64"));
      receiptPath = `${(emp as { id: string }).id}/${Date.now()}__${args.receiptName.replace(/[^a-z0-9._-]/gi, "_")}`;
      await admin.storage.from("expense-receipts").upload(receiptPath, bytes, {
        contentType: args.receiptMime ?? "image/jpeg",
        upsert: false,
      });
    } catch (e) {
      console.warn("[expense] receipt upload err:", (e as Error).message);
      receiptPath = null;
    }
  }

  const { data, error } = await admin.from("expense_reports").insert({
    employee_id: (emp as { id: string }).id,
    amount: args.amount,
    expense_date: args.expenseDate,
    category: args.category,
    description: args.description ?? null,
    vendor: args.vendor ?? null,
    vat_amount: args.vatAmount ?? null,
    receipt_storage_path: receiptPath,
    receipt_filename: args.receiptName ?? null,
    status: "pending",
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert KO" };

  revalidatePath("/me/expenses");
  revalidatePath("/rh/expenses");
  return { ok: true, id: data.id };
}

export async function approveExpenseAction(args: {
  expenseId: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();
  const { error } = await admin.from("expense_reports").update({
    status: "approved",
    reviewed_at: new Date().toISOString(),
    reviewer_profile_id: profile.id,
    review_note: args.note ?? null,
  }).eq("id", args.expenseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/expenses");
  return { ok: true };
}

export async function refuseExpenseAction(args: {
  expenseId: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();
  const { error } = await admin.from("expense_reports").update({
    status: "refused",
    reviewed_at: new Date().toISOString(),
    reviewer_profile_id: profile.id,
    refusal_reason: args.reason,
  }).eq("id", args.expenseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/expenses");
  return { ok: true };
}

export async function markExpensePaidAction(args: {
  expenseId: string;
}): Promise<{ ok: boolean; qrUrl?: string; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: exp } = await admin.from("expense_reports")
    .select("id, amount, employee_id, employee:employees(full_name, iban, bic)")
    .eq("id", args.expenseId)
    .maybeSingle();
  if (!exp) return { ok: false, error: "Note de frais introuvable" };
  const e = exp as { id: string; amount: number; employee_id: string; employee?: { full_name: string; iban: string | null; bic: string | null } | null };
  if (!e.employee?.iban) return { ok: false, error: "IBAN employé manquant" };

  // Génère QR EPC SEPA
  let qrData: string | null = null;
  try {
    const { generateEpcQr } = await import("@/lib/qr-epc");
    const r = await generateEpcQr({
      beneficiaryName: e.employee.full_name,
      iban: e.employee.iban,
      bic: e.employee.bic ?? undefined,
      amount: Number(e.amount),
      remittance: `Note de frais ${new Date().toISOString().slice(0, 10)}`,
    });
    qrData = r.dataUrl ?? null;
  } catch (err) {
    console.warn("[expense] qr err:", (err as Error).message);
  }

  await admin.from("expense_reports").update({
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_by: profile.id,
    payment_qr_data: qrData,
  }).eq("id", args.expenseId);

  revalidatePath("/rh/expenses");
  return { ok: true, qrUrl: qrData ?? undefined };
}

export async function getReceiptUrlAction(expenseId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("expense_reports").select("receipt_storage_path").eq("id", expenseId).maybeSingle();
  const path = (data as { receipt_storage_path?: string | null } | null)?.receipt_storage_path;
  if (!path) return { ok: false, error: "Pas de justificatif" };
  const { data: signed } = await admin.storage.from("expense-receipts").createSignedUrl(path, 3600);
  if (!signed?.signedUrl) return { ok: false, error: "URL KO" };
  return { ok: true, url: signed.signedUrl };
}
