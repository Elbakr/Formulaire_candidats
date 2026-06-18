import "server-only";

// Karim 2026-06-18 : entités juridiques (employeurs) en base + résolution de
// l'entité d'un travailleur via son SITE PRINCIPAL. Les documents sortants
// (contrats, rupture) utilisent l'entité du site où travaille la personne, avec
// le bon libellé de signature.

import type { SupabaseClient } from "@supabase/supabase-js";

export type EmployerOrg = {
  key: string;
  name: string;
  signature_label: string;
  address: string | null;
  locality: string | null;
  bce: string | null;
  onss: string | null;
  rc: string | null;
  representative: string | null;
  co_representative: string | null;
  co_representative_email: string | null;
  paritary_commission: string | null;
  email: string | null;
  phone: string | null;
  sort_order: number;
  is_active: boolean;
};

const COLS =
  "key,name,signature_label,address,locality,bce,onss,rc,representative,co_representative,co_representative_email,paritary_commission,email,phone,sort_order,is_active";

export async function listEmployerOrgs(admin: SupabaseClient): Promise<EmployerOrg[]> {
  const { data } = await admin.from("employer_orgs").select(COLS).order("sort_order");
  return (data ?? []) as EmployerOrg[];
}

export async function getEmployerOrg(admin: SupabaseClient, key: string): Promise<EmployerOrg | null> {
  if (!key) return null;
  const { data } = await admin.from("employer_orgs").select(COLS).eq("key", key).maybeSingle();
  return (data as EmployerOrg | null) ?? null;
}

/**
 * Entité du travailleur = entité de son SITE PRINCIPAL actif. Replis successifs :
 * n'importe quelle affectation active -> employer_org_key du dernier payslip ->
 * amd_megastore (défaut historique).
 */
export async function resolveEmployerOrgForEmployee(
  admin: SupabaseClient,
  employeeId: string,
): Promise<EmployerOrg | null> {
  const today = new Date().toISOString().slice(0, 10);

  const pickKey = async (primaryOnly: boolean): Promise<string | null> => {
    let q = admin
      .from("site_assignments")
      .select("is_primary, start_date, end_date, site:sites(employer_org_key)")
      .eq("employee_id", employeeId)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (primaryOnly) q = q.eq("is_primary", true);
    const { data } = await q.limit(1).maybeSingle();
    const key = (data as { site?: { employer_org_key?: string | null } | null } | null)?.site?.employer_org_key;
    return key ?? null;
  };

  let key = await pickKey(true);
  if (!key) key = await pickKey(false);

  if (!key) {
    const { data: ps } = await admin
      .from("payslips")
      .select("employer_org_key")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    key = (ps as { employer_org_key?: string | null } | null)?.employer_org_key ?? null;
  }

  return (await getEmployerOrg(admin, key ?? "amd_megastore")) ?? (await getEmployerOrg(admin, "amd_megastore"));
}
