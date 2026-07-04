import "server-only";

// Karim 2026-07-04 (convergence C1) : accès unifié à dimona_declarations (schéma A
// LIVE : declaration_kind 'IN'/'OUT', start_date NOT NULL, status pending/
// declared_onss/confirmed/rejected/cancelled). Remplace les `upsert onConflict
// employee_id,kind` cassés (colonne/contrainte inexistantes) par un select-puis-
// insert/update robuste.

import type { SupabaseClient } from "@supabase/supabase-js";

export type DimonaUpsert = {
  employee_id: string;
  declaration_kind: "IN" | "OUT";
  start_date: string;              // NOT NULL — pour un OUT, mettre la date de fin/effet
  end_date?: string | null;
  worker_type?: string;            // OTH / STU / EXT ...
  employer_org_key?: string | null;
  status?: string;                 // défaut 'pending'
  notes?: string | null;
  contract_id?: string | null;
  declared_at?: string | null;     // horodatage de déclaration ONSS
  declared_by?: string | null;     // uuid profile
  dimona_period_id?: string | null;
};

export async function upsertDimonaDeclaration(
  admin: SupabaseClient,
  f: DimonaUpsert,
): Promise<string | null> {
  const row: Record<string, unknown> = {
    employee_id: f.employee_id,
    declaration_kind: f.declaration_kind,
    start_date: f.start_date,
    end_date: f.end_date ?? null,
    worker_type: f.worker_type ?? "OTH",
    employer_org_key: f.employer_org_key ?? "amd_megastore",
    status: f.status ?? "pending",
  };
  if (f.notes !== undefined) row.notes = f.notes;
  if (f.contract_id !== undefined) row.contract_id = f.contract_id;
  if (f.declared_at !== undefined) row.declared_at = f.declared_at;
  if (f.declared_by !== undefined) row.declared_by = f.declared_by;
  if (f.dimona_period_id !== undefined) row.dimona_period_id = f.dimona_period_id;

  const { data: existing } = await admin
    .from("dimona_declarations")
    .select("id")
    .eq("employee_id", f.employee_id)
    .eq("declaration_kind", f.declaration_kind)
    .maybeSingle();

  if (existing) {
    const id = (existing as { id: string }).id;
    await admin.from("dimona_declarations").update(row).eq("id", id);
    return id;
  }
  const { data } = await admin.from("dimona_declarations").insert(row).select("id").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
