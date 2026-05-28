"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function assignEmployeeToSiteAction(input: {
  employeeId: string;
  siteId: string;
  startDate: string;
  endDate?: string | null;
  isPrimary?: boolean;
  pct?: number;
  isSiteManager?: boolean;
  substituteEmployeeId?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  // Karim 2026-05-21 : interdit le chevauchement d affectations pour un meme
  // couple (employee, site). Deux affectations actives sur la meme periode
  // creent des doublons dans la liste des membres du site + perturbent le
  // calcul du solver. Si une affectation existante chevauche, on rejette
  // avec un message explicite indiquant quoi faire.
  const newStart = input.startDate;
  const newEnd = input.endDate ?? "9999-12-31";
  const { data: existing } = await supabase
    .from("site_assignments")
    .select("id, start_date, end_date, is_primary, is_site_manager")
    .eq("employee_id", input.employeeId)
    .eq("site_id", input.siteId);
  type ER = { id: string; start_date: string; end_date: string | null; is_primary: boolean; is_site_manager: boolean };
  const conflict = ((existing ?? []) as ER[]).find((r) => {
    const rEnd = r.end_date ?? "9999-12-31";
    return r.start_date <= newEnd && rEnd >= newStart;
  });
  if (conflict) {
    const fmt = (d: string) => (d >= "9000-01-01" ? "sans fin" : d);
    return {
      error: `Une affectation existe deja pour cet employe sur ce site sur la periode ${conflict.start_date} -> ${fmt(conflict.end_date ?? "9999-12-31")} (${conflict.is_primary ? "principal" : "secondaire"}${conflict.is_site_manager ? ", responsable" : ""}). Pour creer une nouvelle affectation : (1) cloture l affectation existante avec une date de fin precise, OU (2) modifie l affectation existante directement (statut primary/responsable/dates). Pas de doublon autorise.`,
    };
  }

  // Insert assignment.
  const { error: insErr } = await supabase.from("site_assignments").insert({
    employee_id: input.employeeId,
    site_id: input.siteId,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    is_primary: !!input.isPrimary,
    pct: input.pct ?? 100,
    is_site_manager: !!input.isSiteManager,
    substitute_employee_id: input.substituteEmployeeId ?? null,
  });
  if (insErr) return { error: insErr.message };

  // Auto-join chat group du site (si l'employé a un profil).
  const { data: emp } = await supabase
    .from("employees")
    .select("profile_id")
    .eq("id", input.employeeId)
    .maybeSingle();
  const profileId = (emp as { profile_id: string | null } | null)?.profile_id ?? null;

  if (profileId) {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", input.siteId)
      .maybeSingle();
    if (room) {
      // ON CONFLICT DO NOTHING via upsert ignoreDuplicates.
      await supabase
        .from("chat_room_members")
        .upsert(
          { room_id: (room as { id: string }).id, profile_id: profileId, role: "member" },
          { onConflict: "room_id,profile_id", ignoreDuplicates: true },
        );
    }
  }

  // Karim 2026-05-21 : harmonisation des flags responsable -> employees
  if (input.isSiteManager) {
    await supabase
      .from("employees")
      .update({ is_site_manager: true, force_full_quota: true })
      .eq("id", input.employeeId);
  }

  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true };
}

export async function endAssignmentAction(input: {
  assignmentId: string;
  employeeId: string;
  endDate: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assignments")
    .update({ end_date: input.endDate })
    .eq("id", input.assignmentId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  return { ok: true };
}

export async function deleteAssignmentAction(input: {
  assignmentId: string;
  employeeId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assignments")
    .delete()
    .eq("id", input.assignmentId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  return { ok: true };
}

// Karim 2026-05-21 : modif des flags responsable/remplacant sur un assignment
// existant. Si is_site_manager passe a true, on impose aussi is_primary=true
// (un responsable est forcement sur son site principal).
export async function updateSiteManagerAction(input: {
  assignmentId: string;
  employeeId: string;
  isSiteManager: boolean;
  substituteEmployeeId?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    is_site_manager: input.isSiteManager,
    substitute_employee_id: input.isSiteManager ? input.substituteEmployeeId ?? null : null,
  };
  if (input.isSiteManager) patch.is_primary = true;
  const { error } = await supabase
    .from("site_assignments")
    .update(patch)
    .eq("id", input.assignmentId);
  if (error) return { error: error.message };
  // Karim 2026-05-21 : harmonisation des flags. Un employe responsable d au
  // moins 1 site doit avoir :
  //   - employees.is_site_manager = true (deduit auto, source = assignments)
  //   - employees.force_full_quota = true (saturationMode actif dans solver)
  // Reciproquement, si plus aucun assignment ne le declare manager, on
  // retire ces flags (sauf si l admin a expressement coche force_full_quota
  // pour une autre raison — on conserve dans ce cas).
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: actives } = await supabase
    .from("site_assignments")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("is_site_manager", true)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const isManagerAny = (actives ?? []).length > 0;
  const empPatch: Record<string, unknown> = { is_site_manager: isManagerAny };
  // Si on vient d activer le statut de responsable, on force aussi force_full_quota
  if (input.isSiteManager) empPatch.force_full_quota = true;
  await supabase.from("employees").update(empPatch).eq("id", input.employeeId);
  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  return { ok: true, isManagerAny };
}

// Charge les candidats au poste de remplacant pour un site donne, tries par
// pertinence (manager > site_manager > anciennete). Exclut l employe en cours.
export async function loadSubstituteCandidatesAction(input: {
  siteId: string;
  excludeEmployeeId: string;
}): Promise<{
  candidates: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    start_date: string | null;
    is_manager: boolean;
    is_site_manager: boolean;
    seniority_label: string;
  }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  // Karim 2026-05-21 : fetch en 2 etapes (assignments puis employees) pour
  // contourner les soucis de jointure embed Supabase.
  const { data: assigns } = await supabase
    .from("site_assignments")
    .select("employee_id")
    .eq("site_id", input.siteId)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const empIds = [...new Set(((assigns ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id))]
    .filter((id) => id !== input.excludeEmployeeId);
  if (empIds.length === 0) return { candidates: [] };
  const { data: empsRaw } = await supabase
    .from("employees")
    .select("id, full_name, job_title, start_date, is_manager, is_site_manager, status")
    .in("id", empIds)
    .eq("status", "active");
  const uniq = (empsRaw ?? []) as Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    start_date: string | null;
    is_manager: boolean;
    is_site_manager: boolean;
    status: string;
  }>;
  // Tri pertinence : is_manager > is_site_manager > anciennete (start_date oldest)
  uniq.sort((a, b) => {
    if (a.is_manager !== b.is_manager) return a.is_manager ? -1 : 1;
    if (a.is_site_manager !== b.is_site_manager) return a.is_site_manager ? -1 : 1;
    const ad = a.start_date ?? "9999";
    const bd = b.start_date ?? "9999";
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
  function label(e: (typeof uniq)[0]): string {
    if (e.is_manager) return "Manager";
    if (e.is_site_manager) return "Responsable site (autre)";
    if (e.start_date) {
      const years = Math.floor(
        (Date.now() - new Date(e.start_date + "T00:00:00").getTime()) / (365.25 * 86400000),
      );
      return years >= 1 ? `Ancienne (${years} an${years > 1 ? "s" : ""})` : "Junior";
    }
    return "—";
  }
  return {
    candidates: uniq.map((e) => ({
      id: e.id,
      full_name: e.full_name,
      job_title: e.job_title,
      start_date: e.start_date,
      is_manager: e.is_manager,
      is_site_manager: e.is_site_manager,
      seniority_label: label(e),
    })),
  };
}
