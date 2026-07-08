"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions-server";
import type { EmployerOrgKey } from "@/lib/contract-renderer";

export interface SenderMapEntry {
  pattern: string;
  employer: EmployerOrgKey;
}

const VALID_EMPLOYERS: EmployerOrgKey[] = ["amd_megastore", "caftan_factory"];

export async function getPayslipSenderMap(): Promise<SenderMapEntry[]> {
  await requirePermission("payslips");
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_settings")
    .select("payslip_sender_map")
    .eq("id", 1)
    .maybeSingle();
  if (!Array.isArray(data?.payslip_sender_map)) return [];
  return data.payslip_sender_map as SenderMapEntry[];
}

export async function updatePayslipSenderMap(
  entries: SenderMapEntry[],
): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("payslips");

  // Validation
  for (const entry of entries) {
    if (!entry.pattern || entry.pattern.trim() === "") {
      return { error: "Chaque entrée doit avoir un pattern non vide." };
    }
    if (!VALID_EMPLOYERS.includes(entry.employer)) {
      return { error: `Employeur invalide : ${entry.employer}. Valeurs acceptées : amd_megastore, caftan_factory.` };
    }
  }

  const cleaned: SenderMapEntry[] = entries.map((e) => ({
    pattern: e.pattern.trim(),
    employer: e.employer,
  }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("org_settings")
    .update({ payslip_sender_map: cleaned })
    .eq("id", 1);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return { ok: true };
}
