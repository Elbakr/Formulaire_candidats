"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

const NUM = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const STR = (v: FormDataEntryValue | null) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();
const INT = (v: FormDataEntryValue | null) => {
  const n = NUM(v);
  return n == null ? null : Math.round(n);
};

type EmployeeRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  contract_type: string | null;
  weekly_hours: number | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  trial_end_date: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nrn: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  profile_id: string | null;
};

type SiteRow = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
};

/**
 * Calcule le nombre de semaines de période d'essai par défaut côté Belgique.
 * - CDI : 6 semaines (max légal selon usage 2026, sauf cadre).
 * - CDD : ~1/3 de la durée — borné à [2, 6] semaines pour cohérence.
 * - Autre : 2 semaines par défaut.
 */
function defaultTrialWeeks(
  kind: string,
  startDate: string | null,
  endDate: string | null,
): number {
  if (kind === "CDI") return 6;
  if (kind === "CDD" && startDate && endDate) {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      const days = Math.round((e - s) / 86400000);
      const weeks = Math.max(2, Math.min(6, Math.round(days / 7 / 3)));
      return weeks;
    }
  }
  return 2;
}

function generateReadablePassword(length: number): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = lower + upper + digits + symbols;
  const arr = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  const out: string[] = [
    lower[arr[0] % lower.length],
    upper[arr[1] % upper.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) out.push(all[arr[i] % all.length]);
  return out.sort(() => Math.random() - 0.5).join("");
}

/**
 * Helper interne — auto-active le compte employé en créant un user auth + profile + lien.
 * Idempotent : ne fait rien si profile_id existe déjà.
 */
async function ensureAuthForEmployee(
  employeeId: string,
): Promise<{ created: boolean; email?: string; password?: string; error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, email, profile_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { created: false, error: "Employé introuvable." };
  const e = emp as {
    id: string;
    full_name: string;
    email: string | null;
    profile_id: string | null;
  };
  if (e.profile_id) return { created: false };
  if (!e.email)
    return {
      created: false,
      error: "Pas d'email sur la fiche employé — ajoute-en un avant la signature.",
    };

  const password = generateReadablePassword(12);

  let userId: string | null = null;
  const { data: pages } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = pages?.users.find(
    (u) => u.email?.toLowerCase() === e.email!.toLowerCase(),
  );
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: e.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: e.full_name },
    });
    if (error) return { created: false, error: error.message };
    userId = data.user.id;
  }

  await admin.from("profiles").upsert(
    { id: userId!, email: e.email, full_name: e.full_name, role: "candidate" },
    { onConflict: "id" },
  );

  await admin.from("employees").update({ profile_id: userId }).eq("id", e.id);

  return { created: true, email: e.email, password };
}

/**
 * Pré-remplit un nouveau contrat à partir des données employee + site primaire.
 * Refuse de créer un nouveau draft s'il en existe déjà un (force édition).
 */
export async function prepareContractAction(
  employeeId: string,
): Promise<{ ok?: boolean; error?: string; contractId?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("employee_contracts")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "draft")
    .maybeSingle();
  if (existing) {
    return { ok: true, contractId: (existing as { id: string }).id };
  }

  const { data: empRaw } = await supabase
    .from("employees")
    .select(
      "id, full_name, email, phone, job_title, contract_type, weekly_hours, hourly_rate, start_date, end_date, trial_end_date, birth_date, birth_place, nrn, address, postal_code, city, profile_id",
    )
    .eq("id", employeeId)
    .maybeSingle();
  if (!empRaw) return { error: "Employé introuvable." };
  const emp = empRaw as EmployeeRow;

  // Site primaire (workplace)
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("is_primary, site:sites(id, code, name, city, address)")
    .eq("employee_id", employeeId)
    .is("end_date", null)
    .order("is_primary", { ascending: false })
    .limit(1);
  const assigns = (assignsRaw ?? []) as unknown as Array<{
    is_primary: boolean;
    site: SiteRow | null;
  }>;
  const primarySite = assigns[0]?.site ?? null;

  // Salaire mensuel approximatif si on n'a que l'horaire (38h × 4.33 ≈ 165h)
  const weeklyHours = emp.weekly_hours ?? 38;
  const monthlyHours = Math.round(weeklyHours * 4.33 * 10) / 10;
  const grossMonthly =
    emp.hourly_rate != null
      ? Math.round(emp.hourly_rate * monthlyHours * 100) / 100
      : null;

  const contractKind = emp.contract_type ?? "CDI";
  const startDate = emp.start_date ?? new Date().toISOString().slice(0, 10);
  const trialWeeks = defaultTrialWeeks(contractKind, startDate, emp.end_date);

  const workplaceLabel = primarySite
    ? `${primarySite.name}${primarySite.city ? ` — ${primarySite.city}` : ""}`
    : "Caftan Factory — Schaerbeek";
  const workplaceAddress = primarySite?.address ?? null;

  const payload = {
    employee_id: employeeId,
    full_name: emp.full_name,
    birth_date: emp.birth_date,
    birth_place: emp.birth_place,
    nrn: emp.nrn,
    address: emp.address,
    postal_code: emp.postal_code,
    city: emp.city,

    contract_kind: contractKind,
    start_date: startDate,
    end_date: contractKind === "CDI" ? null : emp.end_date,
    weekly_hours: weeklyHours,
    monthly_hours: monthlyHours,
    position_title: emp.job_title ?? "Vendeur·euse",
    workplace: workplaceLabel,
    workplace_address: workplaceAddress,
    trial_period_weeks: trialWeeks,

    gross_hourly_rate: emp.hourly_rate,
    gross_monthly_salary: grossMonthly,
    meal_voucher_eur_per_day: 0,
    transport_allowance: null,

    joint_committee: "CP 201 Commerce de détail indépendant",
    paid_holidays_days: 20,
    weekly_rest_day: "dimanche",

    status: "draft",
  };

  const { data: inserted, error } = await supabase
    .from("employee_contracts")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${employeeId}/contract`);
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, contractId: (inserted as { id: string }).id };
}

export async function updateContractAction(
  contractId: string,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("employee_contracts")
    .select("status, employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "Contrat introuvable." };
  const c = current as { status: string; employee_id: string };
  if (c.status !== "draft")
    return { error: "Seuls les contrats en brouillon peuvent être modifiés." };

  const payload = {
    full_name: STR(formData.get("full_name")),
    birth_date: STR(formData.get("birth_date")),
    birth_place: STR(formData.get("birth_place")),
    nrn: STR(formData.get("nrn")),
    address: STR(formData.get("address")),
    postal_code: STR(formData.get("postal_code")),
    city: STR(formData.get("city")),

    contract_kind: STR(formData.get("contract_kind")) ?? "CDI",
    start_date: STR(formData.get("start_date")),
    end_date: STR(formData.get("end_date")),
    weekly_hours: NUM(formData.get("weekly_hours")) ?? 38,
    monthly_hours: NUM(formData.get("monthly_hours")),
    position_title: STR(formData.get("position_title")) ?? "Vendeur·euse",
    workplace: STR(formData.get("workplace")) ?? "Caftan Factory",
    workplace_address: STR(formData.get("workplace_address")),
    trial_period_weeks: INT(formData.get("trial_period_weeks")),

    gross_hourly_rate: NUM(formData.get("gross_hourly_rate")),
    gross_monthly_salary: NUM(formData.get("gross_monthly_salary")),
    meal_voucher_eur_per_day: NUM(formData.get("meal_voucher_eur_per_day")) ?? 0,
    transport_allowance: STR(formData.get("transport_allowance")),

    joint_committee:
      STR(formData.get("joint_committee")) ?? "CP 201 Commerce de détail indépendant",
    paid_holidays_days: INT(formData.get("paid_holidays_days")) ?? 20,
    weekly_rest_day: STR(formData.get("weekly_rest_day")) ?? "dimanche",

    notes: STR(formData.get("notes")),
  };

  const { error } = await supabase
    .from("employee_contracts")
    .update(payload)
    .eq("id", contractId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${c.employee_id}/contract/${contractId}`);
  revalidatePath(`/planning/employees/${c.employee_id}/contract`);
  return { ok: true };
}

export async function markContractReadyAction(
  contractId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("employee_contracts")
    .select("status, employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "Contrat introuvable." };
  const c = current as { status: string; employee_id: string };
  if (c.status !== "draft")
    return { error: "Le contrat n'est pas en brouillon." };

  const { error } = await supabase
    .from("employee_contracts")
    .update({ status: "ready_to_sign" })
    .eq("id", contractId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${c.employee_id}/contract/${contractId}`);
  revalidatePath(`/planning/employees/${c.employee_id}/contract`);
  revalidatePath(`/planning/employees/${c.employee_id}`);
  return { ok: true };
}

/**
 * Marque un contrat comme signé.
 * Trigger : met à jour employees.start_date si non fixé, auto-active le compte
 * employé (si pas encore lié), et instancie l'onboarding run par défaut si
 * pas encore présent (filet de sécurité — le trigger SQL le fait déjà à la
 * création de l'employé, mais on couvre le cas où le template par défaut
 * aurait été ajouté après).
 */
export async function markContractSignedAction(
  contractId: string,
): Promise<{
  ok?: boolean;
  error?: string;
  credentials?: { email: string; password: string };
}> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: current } = await supabase
    .from("employee_contracts")
    .select("id, status, employee_id, start_date")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "Contrat introuvable." };
  const c = current as {
    id: string;
    status: string;
    employee_id: string;
    start_date: string;
  };
  if (c.status !== "ready_to_sign") {
    return {
      error: "Le contrat doit être prêt à signer avant d'être marqué signé.",
    };
  }

  const { error: updErr } = await supabase
    .from("employee_contracts")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signed_by_admin: profile.id,
    })
    .eq("id", contractId);
  if (updErr) return { error: updErr.message };

  // Si l'employé n'a pas encore de start_date, on prend celle du contrat.
  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, start_date, profile_id")
    .eq("id", c.employee_id)
    .maybeSingle();
  if (empRaw) {
    const emp = empRaw as {
      id: string;
      start_date: string | null;
      profile_id: string | null;
    };
    if (!emp.start_date && c.start_date) {
      await supabase
        .from("employees")
        .update({ start_date: c.start_date })
        .eq("id", c.employee_id);
    }
  }

  // Auto-active le compte employé si pas encore lié.
  let credentials: { email: string; password: string } | undefined;
  const auth = await ensureAuthForEmployee(c.employee_id);
  if (auth.created && auth.email && auth.password) {
    credentials = { email: auth.email, password: auth.password };
  }

  // Filet : instancie un onboarding_run si l'employé n'en a pas.
  const { data: existingRun } = await admin
    .from("onboarding_runs")
    .select("id")
    .eq("employee_id", c.employee_id)
    .maybeSingle();
  if (!existingRun) {
    const { data: tplRaw } = await admin
      .from("onboarding_templates")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();
    const tplId = (tplRaw as { id: string } | null)?.id;
    if (tplId) {
      const { data: runIns } = await admin
        .from("onboarding_runs")
        .insert({ employee_id: c.employee_id, template_id: tplId })
        .select("id")
        .single();
      const newRunId = (runIns as { id: string } | null)?.id;
      if (newRunId) {
        const { data: itemsRaw } = await admin
          .from("onboarding_template_items")
          .select(
            "id, label, description, category, is_required, responsible_role, position",
          )
          .eq("template_id", tplId)
          .order("position");
        const items = (itemsRaw ?? []) as Array<{
          id: string;
          label: string;
          description: string | null;
          category: string | null;
          is_required: boolean;
          responsible_role: string | null;
          position: number;
        }>;
        if (items.length > 0) {
          await admin.from("onboarding_run_items").insert(
            items.map((it) => ({
              run_id: newRunId,
              template_item_id: it.id,
              label: it.label,
              description: it.description,
              category: it.category,
              is_required: it.is_required,
              responsible_role: it.responsible_role,
              position: it.position,
            })),
          );
        }
      }
    }
  }

  // Activity log (best effort)
  try {
    await admin.from("activity").insert({
      kind: "contract.signed",
      description: `Contrat signé pour ${c.employee_id}`,
      actor_id: profile.id,
      actor_label: profile.full_name ?? profile.email,
    });
  } catch {
    /* ignore */
  }

  revalidatePath(`/planning/employees/${c.employee_id}/contract/${contractId}`);
  revalidatePath(`/planning/employees/${c.employee_id}/contract`);
  revalidatePath(`/planning/employees/${c.employee_id}`);
  revalidatePath(`/planning/employees/${c.employee_id}/dimona`);

  return { ok: true, credentials };
}

export async function archiveContractAction(
  contractId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("employee_contracts")
    .select("employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "Contrat introuvable." };
  const c = current as { employee_id: string };

  const { error } = await supabase
    .from("employee_contracts")
    .update({ status: "archived" })
    .eq("id", contractId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${c.employee_id}/contract`);
  revalidatePath(`/planning/employees/${c.employee_id}`);
  return { ok: true };
}

/**
 * Enregistre une déclaration Dimona effectuée par le RH via le portail ONSS.
 * V1 : pas d'intégration API, c'est juste une trace + le N° référence.
 */
export async function recordDimonaDeclarationAction(
  employeeId: string,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const referenceNumber = STR(formData.get("reference_number"));
  const declarationKind = STR(formData.get("declaration_kind")) ?? "IN";
  const startDate = STR(formData.get("start_date"));
  const endDate = STR(formData.get("end_date"));
  const workerType = STR(formData.get("worker_type")) ?? "OTH";
  const declaredAtRaw = STR(formData.get("declared_at"));
  const notes = STR(formData.get("notes"));
  const contractId = STR(formData.get("contract_id"));

  if (!startDate) return { error: "Date de début obligatoire." };

  const declaredAt = declaredAtRaw
    ? new Date(declaredAtRaw).toISOString()
    : new Date().toISOString();

  const { error } = await supabase.from("dimona_declarations").insert({
    employee_id: employeeId,
    contract_id: contractId,
    declaration_kind: declarationKind,
    start_date: startDate,
    end_date: endDate,
    worker_type: workerType,
    status: "declared_onss",
    reference_number: referenceNumber,
    declared_at: declaredAt,
    declared_by: profile.id,
    notes,
  });
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${employeeId}/dimona`);
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}

export async function deleteDimonaDeclarationAction(
  declarationId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("dimona_declarations")
    .select("employee_id")
    .eq("id", declarationId)
    .maybeSingle();
  if (!current) return { error: "Déclaration introuvable." };
  const c = current as { employee_id: string };

  const { error } = await supabase
    .from("dimona_declarations")
    .delete()
    .eq("id", declarationId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${c.employee_id}/dimona`);
  return { ok: true };
}
