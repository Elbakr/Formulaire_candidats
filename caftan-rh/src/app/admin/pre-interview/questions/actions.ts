"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PreInterviewQuestionKind } from "@/lib/pre-interview-types";

const VALID_KINDS: PreInterviewQuestionKind[] = [
  "text",
  "single_choice",
  "multi_choice",
  "scale_1_5",
  "video",
];

const VALID_ROLES = ["all", "vendeur", "gerant", "gestionnaire"];

function parseChoices(raw: string): { value: string; label: string }[] | null {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return lines.map((line) => {
    // "value=Label" OR "Label"
    const idx = line.indexOf("=");
    if (idx > 0) {
      const value = line.slice(0, idx).trim();
      const label = line.slice(idx + 1).trim();
      return { value, label: label || value };
    }
    const slug = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    return { value: slug || line, label: line };
  });
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || `q_${Date.now()}`
  );
}

export async function upsertPreInterviewQuestionAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim() || null;
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const positionRole = String(formData.get("position_role") ?? "all").trim();
  const language = String(formData.get("language_code") ?? "fr").trim() || "fr";
  const prompt = String(formData.get("prompt") ?? "").trim();
  const kind = String(formData.get("kind") ?? "text").trim() as PreInterviewQuestionKind;
  const choicesRaw = String(formData.get("choices") ?? "").trim();
  const minChars = Math.max(0, parseInt(String(formData.get("min_chars") ?? "0"), 10) || 0);
  const maxChars = Math.max(0, parseInt(String(formData.get("max_chars") ?? "2000"), 10) || 2000);
  const isRequired = formData.get("is_required") === "on";
  const isActive = formData.get("is_active") === "on";
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "100"), 10) || 100;
  const videoMaxSecondsRaw = String(formData.get("video_max_seconds") ?? "").trim();
  const videoMaxSeconds =
    kind === "video"
      ? Math.max(10, Math.min(180, parseInt(videoMaxSecondsRaw, 10) || 90))
      : null;

  if (!prompt) return { ok: false as const, error: "Question requise." };
  if (!VALID_KINDS.includes(kind))
    return { ok: false as const, error: "Type de question invalide." };
  if (!VALID_ROLES.includes(positionRole))
    return { ok: false as const, error: "Profil de poste invalide." };

  const choices =
    kind === "single_choice" || kind === "multi_choice"
      ? parseChoices(choicesRaw)
      : null;
  if ((kind === "single_choice" || kind === "multi_choice") && (!choices || choices.length === 0)) {
    return { ok: false as const, error: "Au moins une option est requise pour ce type." };
  }

  const slug = slugRaw || slugify(prompt);

  if (id) {
    const { error } = await supabase
      .from("pre_interview_questions")
      .update({
        slug,
        position_role: positionRole,
        language_code: language,
        prompt,
        kind,
        choices,
        min_chars: minChars,
        max_chars: maxChars,
        is_required: isRequired,
        is_active: isActive,
        sort_order: sortOrder,
        video_max_seconds: videoMaxSeconds,
      })
      .eq("id", id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("pre_interview_questions").insert({
      slug,
      position_role: positionRole,
      language_code: language,
      prompt,
      kind,
      choices,
      min_chars: minChars,
      max_chars: maxChars,
      is_required: isRequired,
      is_active: isActive,
      sort_order: sortOrder,
      video_max_seconds: videoMaxSeconds,
    });
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/admin/pre-interview/questions");
  return { ok: true as const };
}

export async function deletePreInterviewQuestionAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  // Soft-disable rather than hard-delete to keep response history readable.
  const { error } = await supabase
    .from("pre_interview_questions")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/pre-interview/questions");
  return { ok: true as const };
}

export async function togglePreInterviewQuestionActiveAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("pre_interview_questions")
    .select("is_active")
    .eq("id", id)
    .single();
  if (!data) return { ok: false as const, error: "Question introuvable." };
  const next = !(data as { is_active: boolean }).is_active;
  const { error } = await supabase
    .from("pre_interview_questions")
    .update({ is_active: next })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/pre-interview/questions");
  return { ok: true as const, is_active: next };
}
