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
      status: "declared",
      declared_at: new Date().toISOString(),
      declared_by: profile.id,
      dimona_period_id: args.periodId ?? null,
      note: args.note ?? null,
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
  const { data: existing } = await admin
    .from("dimona_declarations")
    .select("id")
    .eq("employee_id", args.employeeId)
    .eq("kind", args.kind)
    .maybeSingle();
  if (existing) {
    await admin.from("dimona_declarations").update({
      declared_start_date: args.startDate ?? null,
      declared_end_date: args.endDate ?? null,
      worker_type: args.workerType ?? "OTH",
      employer_org_key: args.employerOrgKey ?? "amd_megastore",
    }).eq("id", (existing as { id: string }).id);
    return { ok: true, id: (existing as { id: string }).id };
  }
  const { data, error } = await admin
    .from("dimona_declarations")
    .insert({
      employee_id: args.employeeId,
      kind: args.kind,
      declared_start_date: args.startDate ?? null,
      declared_end_date: args.endDate ?? null,
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
