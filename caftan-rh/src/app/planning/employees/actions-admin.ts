"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

const NUM = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const STR = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const ARR = (v: FormDataEntryValue | null) => {
  if (v == null) return [];
  try { const a = JSON.parse(String(v)); return Array.isArray(a) ? a : []; } catch { return []; }
};

export async function saveEmployeeAdminAction(employeeId: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const dept = STR(formData.get("department_id"));
  const manager = STR(formData.get("manager_id"));

  const payload = {
    full_name: STR(formData.get("full_name")),
    email: STR(formData.get("email"))?.toLowerCase(),
    phone: STR(formData.get("phone")),
    job_title: STR(formData.get("job_title")),
    department_id: dept === "none" ? null : dept,
    manager_id: manager === "none" ? null : manager,
    contract_type: STR(formData.get("contract_type")),
    status: STR(formData.get("status")) ?? "active",
    weekly_hours: NUM(formData.get("weekly_hours")),
    hourly_rate: NUM(formData.get("hourly_rate")),
    start_date: STR(formData.get("start_date")),
    end_date: STR(formData.get("end_date")),
    trial_end_date: STR(formData.get("trial_end_date")),
    annual_hours_budget: NUM(formData.get("annual_hours_budget")),
    nrn: STR(formData.get("nrn")),
    cin_number: STR(formData.get("cin_number")),
    address: STR(formData.get("address")),
    postal_code: STR(formData.get("postal_code")),
    city: STR(formData.get("city")),
    iban: STR(formData.get("iban")),
    bic: STR(formData.get("bic")),
    bank_holder: STR(formData.get("bank_holder")),
    transport_type: STR(formData.get("transport_type")),
    transport_price: STR(formData.get("transport_price")),
    fixed_off_days: ARR(formData.get("fixed_off_days")),
    preferred_site_ids: ARR(formData.get("preferred_site_ids")),
    unavailable_site_ids: ARR(formData.get("unavailable_site_ids")),
    default_start_time: STR(formData.get("default_start_time")),
    default_pause_minutes: NUM(formData.get("default_pause_minutes")) ?? 30,
    default_shift_hours: NUM(formData.get("default_shift_hours")) ?? 8,
    wd_mode: STR(formData.get("wd_mode")) ?? "auto",
    week_cycle: NUM(formData.get("week_cycle")) ?? 1,
    week_phase: NUM(formData.get("week_phase")) ?? 0,
    planning_notes: STR(formData.get("planning_notes")),
    notes_admin: STR(formData.get("notes_admin")),
    ot_eligible: formData.get("ot_eligible") === "on",
  };

  const { error } = await supabase.from("employees").update(payload).eq("id", employeeId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees");
  return { ok: true };
}

export async function archiveEmployeeAction(
  employeeId: string,
  endDate?: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const today = endDate || new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("employees")
    .update({ status: "archived", end_date: today })
    .eq("id", employeeId);
  if (error) return { error: error.message };

  // Clôture les site_assignments encore ouverts.
  await supabase
    .from("site_assignments")
    .update({ end_date: today })
    .eq("employee_id", employeeId)
    .is("end_date", null);

  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees");
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true };
}

export async function reactivateEmployeeAction(
  employeeId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status: "active", end_date: null })
    .eq("id", employeeId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees");
  return { ok: true };
}

/**
 * Crée un compte auth Supabase pour un employé existant qui n'en a pas encore.
 * Génère un mot de passe random fort que le RH transmet à l'employé.
 * Lie le profile au employees row.
 */
export async function inviteEmployeeAction(
  employeeId: string,
): Promise<{ ok?: boolean; error?: string; email?: string; password?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, email, profile_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employé introuvable." };
  const e = emp as {
    id: string;
    full_name: string;
    email: string | null;
    profile_id: string | null;
  };
  if (e.profile_id) {
    return {
      error:
        "Cet employé a déjà un compte. Utilise « réinitialiser mot de passe » sur sa fiche.",
    };
  }
  if (!e.email) return { error: "Renseigne d'abord un email sur la fiche employé." };

  // Génère un mot de passe random fort lisible (12 chars, majuscule + minuscule + chiffre + symbole)
  const password = generateReadablePassword(12);

  // Cherche si un user auth existe déjà avec cet email
  let userId: string | null = null;
  const { data: pages } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = pages?.users.find(
    (u) => u.email?.toLowerCase() === e.email!.toLowerCase(),
  );
  if (existing) {
    userId = existing.id;
    // Reset son mot de passe à celui qu'on vient de générer
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
    if (error) return { error: error.message };
    userId = data.user.id;
  }

  // Upsert profile (rôle 'candidate' par défaut — l'app utilise la présence
  // d'un employees row pour savoir que c'est un employé actif).
  await admin.from("profiles").upsert(
    {
      id: userId!,
      email: e.email,
      full_name: e.full_name,
      role: "candidate",
    },
    { onConflict: "id" },
  );

  // Lie le employees row au profile
  await admin.from("employees").update({ profile_id: userId }).eq("id", e.id);

  await logActivity(profile, "employee.invited", `Compte créé pour ${e.full_name}`);

  revalidatePath(`/planning/employees/${e.id}`);
  revalidatePath("/planning/employees");
  return { ok: true, email: e.email, password };
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
  // Garantie 1 char de chaque catégorie
  const out: string[] = [
    lower[arr[0] % lower.length],
    upper[arr[1] % upper.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) out.push(all[arr[i] % all.length]);
  // Shuffle
  return out
    .sort(() => Math.random() - 0.5)
    .join("");
}

async function logActivity(
  profile: { id: string; full_name: string | null; email: string },
  kind: string,
  description: string,
) {
  try {
    const admin = createAdminClient();
    await admin.from("activity").insert({
      kind,
      description,
      actor_id: profile.id,
      actor_label: profile.full_name ?? profile.email,
    });
  } catch {
    /* table activity peut ne pas exister */
  }
}

export async function deleteEmployeeAction(
  employeeId: string,
  confirmName: string,
  alsoDeleteAuth = true,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, profile_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employé introuvable." };
  const e = emp as { id: string; full_name: string; profile_id: string | null };

  if (confirmName.trim().toLowerCase() !== e.full_name.trim().toLowerCase()) {
    return {
      error: `Confirmation invalide. Tape exactement "${e.full_name}" pour confirmer.`,
    };
  }

  const { error } = await supabase.from("employees").delete().eq("id", employeeId);
  if (error) return { error: error.message };

  // Nettoyage complet : profile + user auth (sinon ils restent orphelins)
  if (alsoDeleteAuth && e.profile_id) {
    const admin = createAdminClient();
    await admin.from("profiles").delete().eq("id", e.profile_id);
    try {
      await admin.auth.admin.deleteUser(e.profile_id);
    } catch {
      /* ignore — l'utilisateur peut ne plus exister côté auth */
    }
  }

  revalidatePath("/planning/employees");
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true };
}

/**
 * Archive en lot — soft delete (conserve l'historique). Pas de mot de passe à
 * retaper. Idéal pour purger les démos ou anciens employés.
 */
export async function bulkArchiveEmployeesAction(
  employeeIds: string[],
): Promise<{ ok?: boolean; error?: string; archived?: number }> {
  await requireRole(["admin", "rh"]);
  if (!Array.isArray(employeeIds) || employeeIds.length === 0)
    return { error: "Aucun employé sélectionné." };
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("employees")
    .update({ status: "archived", end_date: today })
    .in("id", employeeIds);
  if (error) return { error: error.message };

  await supabase
    .from("site_assignments")
    .update({ end_date: today })
    .in("employee_id", employeeIds)
    .is("end_date", null);

  revalidatePath("/planning/employees");
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true, archived: employeeIds.length };
}

/**
 * Suppression définitive en lot — admin uniquement. Cascade FK sur shifts,
 * scoring, time_off, documents, site_assignments. Nettoie aussi le profile et
 * le user auth Supabase associés.
 */
export async function bulkDeleteEmployeesAction(
  employeeIds: string[],
  confirmKeyword: string,
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  await requireRole(["admin"]);
  if (!Array.isArray(employeeIds) || employeeIds.length === 0)
    return { error: "Aucun employé sélectionné." };
  if (confirmKeyword.trim().toUpperCase() !== "SUPPRIMER")
    return { error: 'Confirmation invalide. Tape "SUPPRIMER" pour confirmer.' };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: rows } = await supabase
    .from("employees")
    .select("id, profile_id")
    .in("id", employeeIds);
  const profileIds = ((rows ?? []) as Array<{ id: string; profile_id: string | null }>)
    .map((r) => r.profile_id)
    .filter((p): p is string => !!p);

  const { error } = await supabase.from("employees").delete().in("id", employeeIds);
  if (error) return { error: error.message };

  // Nettoie profiles + auth.users
  if (profileIds.length > 0) {
    await admin.from("profiles").delete().in("id", profileIds);
    for (const pid of profileIds) {
      try {
        await admin.auth.admin.deleteUser(pid);
      } catch {
        /* ignore */
      }
    }
  }

  revalidatePath("/planning/employees");
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true, deleted: employeeIds.length };
}
