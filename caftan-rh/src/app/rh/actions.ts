"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  sendInterviewInvite,
  sendRejection,
  sendOffer,
} from "@/lib/emails";
import { formatDateTime } from "@/lib/utils";
import type { ApplicationStatus } from "@/types/database.types";

async function fetchAppContext(applicationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select(`id, candidate:candidates(email, full_name), job:jobs(title)`)
    .eq("id", applicationId)
    .single();
  return data as {
    id: string;
    candidate: { email: string; full_name: string } | null;
    job: { title: string } | null;
  } | null;
}

export async function updateApplicationStatusAction(applicationId: string, status: ApplicationStatus) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ status }).eq("id", applicationId);
  if (error) return { error: error.message };

  // Trigger emails on key transitions + log in messages table
  if (status === "refused" || status === "hired") {
    const ctx = await fetchAppContext(applicationId);
    if (ctx?.candidate?.email) {
      let subject = "";
      let body = "";
      if (status === "refused") {
        subject = "Suite donnée à ta candidature";
        body = `Suite à examen de ton dossier, nous ne pouvons pas donner suite à ta candidature pour cette fois-ci. Bonne continuation.`;
        await sendRejection({ to: ctx.candidate.email, fullName: ctx.candidate.full_name });
      } else if (status === "hired") {
        subject = "Bienvenue dans l'équipe !";
        body = `Nous avons le plaisir de te confirmer ton recrutement au poste de ${ctx.job?.title ?? "ton nouveau poste"}. À très vite pour les prochaines étapes.`;
        await sendOffer({
          to: ctx.candidate.email,
          fullName: ctx.candidate.full_name,
          jobTitle: ctx.job?.title ?? "votre nouveau poste",
        });
      }
      await supabase.from("messages").insert({
        application_id: applicationId,
        direction: "outbound",
        subject,
        body,
      });
    }
  }

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

  // Email d'invitation à l'entretien + log dans messages
  const ctx = await fetchAppContext(applicationId);
  if (ctx?.candidate?.email) {
    const where =
      type === "video"
        ? meetingUrl || "Lien envoyé séparément"
        : type === "phone"
          ? `Téléphone ${location || ""}`
          : location || "Sur place — adresse communiquée";
    const whenLocal = formatDateTime(scheduledAt);
    await sendInterviewInvite({
      to: ctx.candidate.email,
      fullName: ctx.candidate.full_name,
      whenLocal,
      location: where,
    });
    await supabase.from("messages").insert({
      application_id: applicationId,
      direction: "outbound",
      sender_id: profile.id,
      subject: "Convocation à un entretien",
      body: `Tu es convoqué·e à un entretien le ${whenLocal} (${where}).`,
    });
  }

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

  const c = cand as unknown as { id: string };
  await supabase.from("applications").insert({
    candidate_id: c.id,
    job_id: jobId,
    status: "new",
  });

  revalidatePath("/rh", "layout");
  return { ok: true };
}
