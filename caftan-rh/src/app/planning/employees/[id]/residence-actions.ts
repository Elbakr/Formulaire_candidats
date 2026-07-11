"use server";

// Karim 2026-07-11 : saisie MANUELLE des données de séjour sur la fiche (pour les
// travailleurs sans extraction IA), afin d'activer le rappel d'expiration et le
// contrôle du droit au travail. À chaque changement on RECALCULE work_authorization.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { computeWorkAuthorization } from "@/lib/work-authorization";

const EDITABLE = new Set(["residence_doc_type", "residence_doc_expiry", "residence_doc_number", "nationality"]);

export async function saveResidenceFieldAction(
  employeeId: string,
  field: string,
  value: string,
): Promise<{ ok: boolean; error?: string; workStatus?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  if (!EDITABLE.has(field)) return { ok: false, error: "Champ non autorisé." };

  const admin = createAdminClient();
  const v = (value ?? "").trim() || null;

  const { data: cur } = await admin
    .from("employees")
    .select("nationality, residence_doc_type, residence_doc_expiry")
    .eq("id", employeeId)
    .maybeSingle();
  const merged = { ...((cur as Record<string, string | null>) ?? {}), [field]: v };

  const wa = computeWorkAuthorization({
    nationality: merged.nationality,
    docType: merged.residence_doc_type,
    expiry: merged.residence_doc_expiry,
  });

  const { error } = await admin
    .from("employees")
    .update({ [field]: v, work_authorization: wa.status })
    .eq("id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, workStatus: wa.status };
}
