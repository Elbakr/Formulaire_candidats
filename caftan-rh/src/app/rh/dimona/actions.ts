"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function markDimonaDeclaredAction(args: {
  declarationId: string;
  periodId?: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("dimona_declarations")
    .update({
      status: "declared_onss",
      declared_at: new Date().toISOString(),
      declared_by: profile.id,
      dimona_period_id: args.periodId ?? null,
      notes: args.note ?? null,
    })
    .eq("id", args.declarationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/dimona");
  return { ok: true };
}

export async function cancelDimonaDeclarationAction(declarationId: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("dimona_declarations")
    .update({ status: "cancelled" })
    .eq("id", declarationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/rh/dimona");
  return { ok: true };
}

export async function createDimonaDeclarationAction(args: {
  employeeId: string;
  kind: "in" | "out";
  startDate?: string;
  endDate?: string;
  workerType?: "OTH" | "STU" | "EXT";
  employerOrgKey?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  // Schéma A (LIVE) : declaration_kind 'IN'/'OUT' (majuscules), start_date NOT NULL.
  const declKind = args.kind.toUpperCase(); // 'in'/'out' -> 'IN'/'OUT'
  const startDate = args.startDate ?? args.endDate ?? new Date().toISOString().slice(0, 10);
  const { data: existing } = await admin
    .from("dimona_declarations")
    .select("id")
    .eq("employee_id", args.employeeId)
    .eq("declaration_kind", declKind)
    .maybeSingle();
  if (existing) {
    await admin.from("dimona_declarations").update({
      start_date: startDate,
      end_date: args.endDate ?? null,
      worker_type: args.workerType ?? "OTH",
      employer_org_key: args.employerOrgKey ?? "amd_megastore",
    }).eq("id", (existing as { id: string }).id);
    return { ok: true, id: (existing as { id: string }).id };
  }
  const { data, error } = await admin
    .from("dimona_declarations")
    .insert({
      employee_id: args.employeeId,
      declaration_kind: declKind,
      start_date: startDate,
      end_date: args.endDate ?? null,
      worker_type: args.workerType ?? "OTH",
      employer_org_key: args.employerOrgKey ?? "amd_megastore",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert KO" };
  revalidatePath("/rh/dimona");
  return { ok: true, id: data.id };
}
