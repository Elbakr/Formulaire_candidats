"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { ApplicationStatus } from "@/types/database.types";

export async function updateApplicationStatusAction(applicationId: string, status: ApplicationStatus) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status }).eq("id", applicationId);
  if (error) return { error: error.message };
  revalidatePath("/rh", "layout");
  revalidatePath("/manager", "layout");
  return { ok: true };
}

export async function updateApplicationRatingAction(applicationId: string, rating: number) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({ rating: Math.max(0, Math.min(5, rating)) })
    .eq("id", applicationId);
  if (error) return { error: error.message };
  revalidatePath("/rh", "layout");
  return { ok: true };
}

export async function addNoteAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const applicationId = String(formData.get("application_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const isPrivate = formData.get("is_private") === "on";
  if (!applicationId || !body) return { error: "Note vide." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .insert({ application_id: applicationId, author_id: profile.id, body, is_private: isPrivate });
  if (error) return { error: error.message };
  revalidatePath(`/rh/candidates/${applicationId}`);
  revalidatePath("/rh", "layout");
  return { ok: true };
}

export async function scheduleInterviewAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const applicationId = String(formData.get("application_id") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  const type = String(formData.get("type") ?? "onsite");
  const location = String(formData.get("location") ?? "");
  const meetingUrl = String(formData.get("meeting_url") ?? "");
  const duration = Number(formData.get("duration_min") ?? 30);

  if (!applicationId || !scheduledAt) return { error: "Date et candidature requises." };

  const supabase = await createClient();
  const { error: insErr } = await supabase.from("interviews").insert({
    application_id: applicationId,
    scheduled_at: scheduledAt,
    duration_min: duration,
    type: type as "phone" | "video" | "onsite",
    location: location || null,
    meeting_url: meetingUrl || null,
    interviewer: profile.id,
  });
  if (insErr) return { error: insErr.message };

  await supabase
    .from("applications")
    .update({ status: "rdv_scheduled" })
    .eq("id", applicationId);

  revalidatePath("/rh", "layout");
  revalidatePath("/manager", "layout");
  return { ok: true };
}

export async function createCandidateAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const jobId = String(formData.get("job_id") ?? "") || null;

  if (!email || !fullName) return { error: "Nom et email requis." };

  const { data: cand, error } = await supabase
    .from("candidates")
    .insert({ email, full_name: fullName, phone, source: "manuel" })
    .select("id")
    .single();
  if (error || !cand) return { error: error?.message ?? "Échec création" };

  await supabase.from("applications").insert({
    candidate_id: cand.id,
    job_id: jobId,
    status: "new",
  });

  revalidatePath("/rh", "layout");
  return { ok: true };
}
