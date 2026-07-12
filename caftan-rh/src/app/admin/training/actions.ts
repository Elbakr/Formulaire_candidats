"use server";

// Karim 2026-07-12 : éditeur admin du CURRICULUM de formation. Édition du contenu
// (FR/NL), ajout/suppression/réordonnancement des modules, questions d'examens.
// La séquence des `seq` reste CONTIGUË (le drip avance séquentiellement).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExamQuestion = {
  q_fr: string;
  q_nl: string | null;
  choices_fr: string[];
  choices_nl: string[] | null;
  correct: number;
};
export type ModuleInput = {
  id: string;
  category: string | null;
  title_fr: string;
  title_nl: string | null;
  body_fr: string;
  body_nl: string | null;
  exam_level: number | null;
  is_active: boolean;
  questions: ExamQuestion[] | null;
};

/** Réécrit des seq CONTIGUS (1..N) selon l'ordre `ids`, en 2 passes (évite les
 *  conflits d'unicité). */
async function reseq(admin: SupabaseClient, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await admin.from("training_modules").update({ seq: -(i + 1) }).eq("id", ids[i]);
  }
  for (let i = 0; i < ids.length; i++) {
    await admin.from("training_modules").update({ seq: i + 1 }).eq("id", ids[i]);
  }
}

async function orderedIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("training_modules").select("id").order("seq", { ascending: true });
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function saveModuleAction(input: ModuleInput): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!input.id) return { ok: false, error: "Module manquant." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("training_modules")
    .update({
      category: input.category?.trim() || null,
      title_fr: input.title_fr.trim(),
      title_nl: input.title_nl?.trim() || null,
      body_fr: input.body_fr,
      body_nl: input.body_nl || null,
      exam_level: input.exam_level,
      is_active: input.is_active,
      questions: input.questions ? JSON.stringify(input.questions) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/training");
  return { ok: true };
}

/** Ajoute un module JUSTE APRÈS `afterId` (ou à la fin si null). */
export async function addModuleAction(
  kind: "lesson" | "exam",
  afterId: string | null,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const ids = await orderedIds(admin);

  // Insère d'abord à un seq temporaire hors plage, puis reséquence.
  const { data: maxRow } = await admin.from("training_modules").select("seq").order("seq", { ascending: false }).limit(1).maybeSingle();
  const tempSeq = ((maxRow as { seq: number } | null)?.seq ?? 0) + 1000;
  const { data: ins, error } = await admin
    .from("training_modules")
    .insert({
      seq: tempSeq,
      kind,
      category: kind === "exam" ? "Examen" : "Nouveau",
      title_fr: kind === "exam" ? "Nouvel examen 🧩" : "Nouvelle section",
      body_fr: "",
      exam_level: kind === "exam" ? null : null,
      questions: kind === "exam" ? JSON.stringify([]) : null,
      is_active: true,
    })
    .select("id")
    .maybeSingle();
  if (error || !ins) return { ok: false, error: error?.message ?? "insert KO" };
  const newId = (ins as { id: string }).id;

  const pos = afterId ? ids.indexOf(afterId) + 1 : ids.length;
  const newOrder = [...ids.slice(0, pos), newId, ...ids.slice(pos)];
  await reseq(admin, newOrder);
  revalidatePath("/admin/training");
  return { ok: true, id: newId };
}

export async function deleteModuleAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const ids = (await orderedIds(admin)).filter((x) => x !== id);
  const { error } = await admin.from("training_modules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await reseq(admin, ids);
  revalidatePath("/admin/training");
  return { ok: true };
}

export async function moveModuleAction(id: string, dir: "up" | "down"): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const ids = await orderedIds(admin);
  const i = ids.indexOf(id);
  if (i < 0) return { ok: false, error: "introuvable" };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return { ok: true }; // déjà au bord
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reseq(admin, ids);
  revalidatePath("/admin/training");
  return { ok: true };
}
