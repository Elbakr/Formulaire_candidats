"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole, requireProfile } from "@/lib/auth";

type OnbItemRow = {
  id: string;
  run_id: string;
  responsible_role: string;
  done_at: string | null;
  done_by: string | null;
  label: string;
};

type OnbRunRow = {
  id: string;
  employee_id: string;
  completed_at: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  profile_id: string | null;
  manager_id: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Toggle "done" sur un item
// ─────────────────────────────────────────────────────────────────────────────
export async function toggleOnboardingItemAction(itemId: string) {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const { data: itemRaw, error: itemErr } = await supabase
    .from("onboarding_run_items")
    .select("id, run_id, responsible_role, done_at, done_by, label")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr || !itemRaw) return { error: itemErr?.message ?? "Item introuvable." };
  const item = itemRaw as unknown as OnbItemRow;

  // Vérification d'autorisation: admin/RH OK, manager OK, employee si responsable employee + run lui appartient
  const isPrivileged = profile.role === "admin" || profile.role === "rh" || profile.role === "manager";
  if (!isPrivileged) {
    if (item.responsible_role !== "employee") {
      return { error: "Tu n'es pas responsable de cet item." };
    }
    // Vérifie que le run concerne bien cet utilisateur
    const { data: runRaw } = await supabase
      .from("onboarding_runs")
      .select("id, employee_id")
      .eq("id", item.run_id)
      .maybeSingle();
    const run = runRaw as unknown as { id: string; employee_id: string } | null;
    if (!run) return { error: "Run introuvable." };
    const { data: empRaw } = await supabase
      .from("employees")
      .select("id, profile_id")
      .eq("id", run.employee_id)
      .maybeSingle();
    const emp = empRaw as unknown as { id: string; profile_id: string | null } | null;
    if (!emp || emp.profile_id !== user.id) return { error: "Cet item ne te concerne pas." };
  }

  const nextDoneAt = item.done_at ? null : new Date().toISOString();
  const nextDoneBy = item.done_at ? null : profile.id;

  const { error: upErr } = await supabase
    .from("onboarding_run_items")
    .update({ done_at: nextDoneAt, done_by: nextDoneBy })
    .eq("id", itemId);
  if (upErr) return { error: upErr.message };

  // Si tous les items requis sont terminés → close le run, sinon réouvre
  await maybeCloseRun(item.run_id);

  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/${itemId}`); // best effort
  revalidatePath("/me/onboarding");
  return { ok: true, done: !!nextDoneAt };
}

async function maybeCloseRun(runId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("onboarding_run_items")
    .select("id, done_at, is_required")
    .eq("run_id", runId);
  const items = (data ?? []) as unknown as Array<{ id: string; done_at: string | null; is_required: boolean }>;
  if (items.length === 0) return;

  const allDone = items.every((it) => !!it.done_at);
  const { data: runRaw } = await admin
    .from("onboarding_runs")
    .select("id, completed_at, employee_id")
    .eq("id", runId)
    .maybeSingle();
  const run = runRaw as unknown as { id: string; completed_at: string | null; employee_id: string } | null;
  if (!run) return;

  if (allDone && !run.completed_at) {
    await admin
      .from("onboarding_runs")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", runId);
  } else if (!allDone && run.completed_at) {
    await admin
      .from("onboarding_runs")
      .update({ completed_at: null })
      .eq("id", runId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajout d'un item custom à un run
// ─────────────────────────────────────────────────────────────────────────────
export async function addCustomItemAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const runId = String(formData.get("run_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "admin");
  const isRequired = String(formData.get("is_required") ?? "true") === "true";
  const responsibleRole = String(formData.get("responsible_role") ?? "rh");

  if (!runId || !label) return { error: "Run et libellé requis." };

  const supabase = await createClient();

  // Calcule la prochaine position
  const { data: maxData } = await supabase
    .from("onboarding_run_items")
    .select("position")
    .eq("run_id", runId)
    .order("position", { ascending: false })
    .limit(1);
  const arr = (maxData ?? []) as unknown as Array<{ position: number | null }>;
  const nextPos = (arr[0]?.position ?? 0) + 1;

  const { error } = await supabase.from("onboarding_run_items").insert({
    run_id: runId,
    label,
    description,
    category,
    is_required: isRequired,
    responsible_role: responsibleRole,
    position: nextPos,
  });
  if (error) return { error: error.message };

  // Réouvre le run si fermé (un nouvel item ajouté n'est pas done)
  await maybeCloseRun(runId);

  revalidatePath("/onboarding");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppression d'un item
// ─────────────────────────────────────────────────────────────────────────────
export async function removeItemAction(itemId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: itRaw } = await supabase
    .from("onboarding_run_items")
    .select("run_id")
    .eq("id", itemId)
    .maybeSingle();
  const it = itRaw as unknown as { run_id: string } | null;

  const { error } = await supabase.from("onboarding_run_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  if (it?.run_id) await maybeCloseRun(it.run_id);

  revalidatePath("/onboarding");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fermeture manuelle d'un run + notif
// ─────────────────────────────────────────────────────────────────────────────
export async function closeRunAction(runId: string) {
  await requireRole(["admin", "rh", "manager"]);
  const admin = createAdminClient();

  const { data: runRaw } = await admin
    .from("onboarding_runs")
    .select("id, employee_id, completed_at")
    .eq("id", runId)
    .maybeSingle();
  const run = runRaw as unknown as OnbRunRow | null;
  if (!run) return { error: "Run introuvable." };

  const { error } = await admin
    .from("onboarding_runs")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) return { error: error.message };

  // Notifier l'employé + son manager
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, profile_id, manager_id")
    .eq("id", run.employee_id)
    .maybeSingle();
  const emp = empRaw as unknown as EmployeeRow | null;

  if (emp?.profile_id) {
    await admin.rpc("notify_user", {
      recipient: emp.profile_id,
      kind: "onboarding_completed",
      title: "Onboarding terminé",
      body: "Bienvenue ! Ton parcours d'intégration est complet.",
      link: "/me/onboarding",
      data: { run_id: runId },
    });
  }
  if (emp?.manager_id) {
    await admin.rpc("notify_user", {
      recipient: emp.manager_id,
      kind: "onboarding_completed",
      title: "Onboarding terminé",
      body: `${emp.full_name} a terminé son parcours d'intégration.`,
      link: `/onboarding/${emp.id}`,
      data: { run_id: runId, employee_id: emp.id },
    });
  }

  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/${emp?.id ?? ""}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Réouvrir un run (efface completed_at)
// ─────────────────────────────────────────────────────────────────────────────
export async function reopenRunAction(runId: string) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_runs")
    .update({ completed_at: null })
    .eq("id", runId);
  if (error) return { error: error.message };
  revalidatePath("/onboarding");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD templates
// ─────────────────────────────────────────────────────────────────────────────
export async function saveTemplateAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isDefault = String(formData.get("is_default") ?? "false") === "true";

  if (!name) return { error: "Nom requis." };

  const supabase = await createClient();

  if (isDefault) {
    // Reset des autres
    await supabase.from("onboarding_templates").update({ is_default: false }).neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }

  if (id) {
    const { error } = await supabase
      .from("onboarding_templates")
      .update({ name, description, is_default: isDefault })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("onboarding_templates")
      .insert({ name, description, is_default: isDefault });
    if (error) return { error: error.message };
  }

  revalidatePath("/onboarding/templates");
  return { ok: true };
}

export async function deleteTemplateAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/onboarding/templates");
  return { ok: true };
}

export async function saveTemplateItemAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const id = String(formData.get("id") ?? "") || null;
  const templateId = String(formData.get("template_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "admin");
  const isRequired = String(formData.get("is_required") ?? "true") === "true";
  const responsibleRole = String(formData.get("responsible_role") ?? "rh");
  const positionRaw = formData.get("position");

  if (!templateId || !label) return { error: "Template et libellé requis." };

  const supabase = await createClient();

  let position: number;
  if (positionRaw != null && String(positionRaw).length > 0) {
    position = Number(positionRaw);
  } else if (id) {
    // garder l'existant
    const { data: existRaw } = await supabase
      .from("onboarding_template_items")
      .select("position")
      .eq("id", id)
      .maybeSingle();
    const ex = existRaw as unknown as { position: number } | null;
    position = ex?.position ?? 0;
  } else {
    const { data: maxData } = await supabase
      .from("onboarding_template_items")
      .select("position")
      .eq("template_id", templateId)
      .order("position", { ascending: false })
      .limit(1);
    const arr = (maxData ?? []) as unknown as Array<{ position: number | null }>;
    position = (arr[0]?.position ?? 0) + 1;
  }

  if (id) {
    const { error } = await supabase
      .from("onboarding_template_items")
      .update({ label, description, category, is_required: isRequired, responsible_role: responsibleRole, position })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("onboarding_template_items")
      .insert({ template_id: templateId, label, description, category, is_required: isRequired, responsible_role: responsibleRole, position });
    if (error) return { error: error.message };
  }
  revalidatePath("/onboarding/templates");
  return { ok: true };
}

export async function deleteTemplateItemAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_template_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/onboarding/templates");
  return { ok: true };
}

export async function moveTemplateItemAction(id: string, direction: "up" | "down") {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: itemRaw } = await supabase
    .from("onboarding_template_items")
    .select("id, template_id, position")
    .eq("id", id)
    .maybeSingle();
  const item = itemRaw as unknown as { id: string; template_id: string; position: number } | null;
  if (!item) return { error: "Item introuvable." };

  const { data: siblingsRaw } = await supabase
    .from("onboarding_template_items")
    .select("id, position")
    .eq("template_id", item.template_id)
    .order("position");
  const siblings = (siblingsRaw ?? []) as unknown as Array<{ id: string; position: number }>;
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx < 0) return { error: "Index introuvable." };
  const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return { ok: true };

  await supabase.from("onboarding_template_items").update({ position: swapWith.position }).eq("id", item.id);
  await supabase.from("onboarding_template_items").update({ position: item.position }).eq("id", swapWith.id);

  revalidatePath("/onboarding/templates");
  return { ok: true };
}
