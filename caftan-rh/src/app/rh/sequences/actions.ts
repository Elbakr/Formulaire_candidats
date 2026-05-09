"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `seq-${Date.now()}`;
}

export async function createSequenceAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const trigger = String(formData.get("trigger_status") ?? "").trim();
  const trigger_status = trigger && trigger !== "manual" ? trigger : null;
  if (!name) return { error: "Nom requis." };

  const supabase = await createClient();
  const slug = slugify(name);
  const { data, error } = await supabase
    .from("sequences")
    .insert({ name, description, trigger_status, slug, is_active: true })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/rh/sequences");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateSequenceAction(id: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const trigger = String(formData.get("trigger_status") ?? "").trim();
  const trigger_status = trigger && trigger !== "manual" ? trigger : null;
  if (!name) return { error: "Nom requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ name, description, trigger_status })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/rh/sequences");
  revalidatePath(`/rh/sequences/${id}`);
  return { ok: true };
}

export async function deleteSequenceAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("sequences").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/rh/sequences");
  return { ok: true };
}

export async function toggleSequenceActiveAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data, error: e1 } = await supabase
    .from("sequences")
    .select("is_active")
    .eq("id", id)
    .single();
  if (e1) return { error: e1.message };
  const next = !(data as { is_active: boolean }).is_active;
  const { error } = await supabase.from("sequences").update({ is_active: next }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/rh/sequences");
  revalidatePath(`/rh/sequences/${id}`);
  return { ok: true, is_active: next };
}

type StepFields = {
  kind: string;
  delay_days: number;
  email_template_slug: string | null;
  email_subject_override: string | null;
  email_custom_message: string | null;
  notification_target: string | null;
  notification_title: string | null;
  notification_body: string | null;
  note_body: string | null;
  set_status_to: string | null;
};

function readStepFields(formData: FormData): StepFields {
  const kind = String(formData.get("kind") ?? "note");
  const delay_days = Number(formData.get("delay_days") ?? 0) || 0;
  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v : null;
  };
  return {
    kind,
    delay_days,
    email_template_slug: get("email_template_slug"),
    email_subject_override: get("email_subject_override"),
    email_custom_message: get("email_custom_message"),
    notification_target: get("notification_target") ?? "rh",
    notification_title: get("notification_title"),
    notification_body: get("notification_body"),
    note_body: get("note_body"),
    set_status_to: get("set_status_to"),
  };
}

export async function addStepAction(sequenceId: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  // Determine next position
  const { data: maxRow } = await supabase
    .from("sequence_steps")
    .select("position")
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = ((maxRow as { position: number } | null)?.position ?? 0) + 1;

  const fields = readStepFields(formData);
  const { error } = await supabase.from("sequence_steps").insert({
    sequence_id: sequenceId,
    position: nextPos,
    ...fields,
  });
  if (error) return { error: error.message };
  revalidatePath(`/rh/sequences/${sequenceId}`);
  return { ok: true };
}

export async function updateStepAction(stepId: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const fields = readStepFields(formData);
  const { data: row, error: e1 } = await supabase
    .from("sequence_steps")
    .update(fields)
    .eq("id", stepId)
    .select("sequence_id")
    .single();
  if (e1) return { error: e1.message };
  const seqId = (row as { sequence_id: string } | null)?.sequence_id;
  if (seqId) revalidatePath(`/rh/sequences/${seqId}`);
  return { ok: true };
}

export async function deleteStepAction(stepId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("sequence_steps")
    .select("sequence_id")
    .eq("id", stepId)
    .maybeSingle();
  const { error } = await supabase.from("sequence_steps").delete().eq("id", stepId);
  if (error) return { error: error.message };
  const seqId = (row as { sequence_id: string } | null)?.sequence_id;
  if (seqId) revalidatePath(`/rh/sequences/${seqId}`);
  return { ok: true };
}

export async function runSequenceManuallyAction(sequenceId: string, applicationIds: string[]) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!applicationIds || applicationIds.length === 0) {
    return { error: "Aucun candidat sélectionné." };
  }
  const supabase = await createClient();

  // Load sequence steps
  const { data: stepsData, error: stepsErr } = await supabase
    .from("sequence_steps")
    .select(
      "id, position, kind, delay_days, email_template_slug, email_subject_override, email_custom_message, notification_target, notification_title, notification_body, note_body, set_status_to",
    )
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: true });
  if (stepsErr) return { error: stepsErr.message };
  const steps = (stepsData ?? []) as Array<{
    id: string;
    position: number;
    kind: string;
    delay_days: number | null;
  } & Record<string, unknown>>;

  if (steps.length === 0) {
    return { error: "Cette séquence n'a pas d'étapes." };
  }

  let started = 0;
  for (const appId of applicationIds) {
    // Skip if there's already an active run for this seq+app
    const { data: existing } = await supabase
      .from("sequence_runs")
      .select("id")
      .eq("sequence_id", sequenceId)
      .eq("application_id", appId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) continue;

    const { data: run, error: runErr } = await supabase
      .from("sequence_runs")
      .insert({
        sequence_id: sequenceId,
        application_id: appId,
        triggered_by: profile.id,
      })
      .select("id")
      .single();
    if (runErr || !run) continue;
    const runId = (run as { id: string }).id;

    const now = Date.now();
    const inserts = steps.map((st) => {
      const days = Number(st.delay_days ?? 0);
      const fireAt = new Date(now + days * 86_400_000).toISOString();
      return {
        run_id: runId,
        step_id: st.id,
        position: st.position,
        kind: st.kind,
        fire_at: fireAt,
        status: "pending",
        payload: st,
      };
    });
    await supabase.from("sequence_run_steps").insert(inserts);
    started += 1;
  }

  revalidatePath(`/rh/sequences/${sequenceId}`);
  revalidatePath("/rh/sequences");
  return { ok: true, started };
}
