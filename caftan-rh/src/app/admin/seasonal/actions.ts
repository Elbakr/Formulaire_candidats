"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export type SeasonalKind = "peak" | "low" | "closed";

export type SeasonalEventInput = {
  name: string;
  kind: SeasonalKind;
  start_date: string;
  end_date: string;
  staff_multiplier: number;
  notes?: string | null;
};

export async function addSeasonalEventAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "peak").trim() as SeasonalKind;
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim();
  const multStr = String(formData.get("staff_multiplier") ?? "1.0").trim();
  const staff_multiplier = Number(multStr.replace(",", "."));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Nom requis." };
  if (!start_date || !end_date) return { error: "Dates requises." };
  if (start_date > end_date) return { error: "La date de fin doit être >= date de début." };
  if (!["peak", "low", "closed"].includes(kind)) return { error: "Kind invalide." };
  if (!Number.isFinite(staff_multiplier) || staff_multiplier < 0.1 || staff_multiplier > 3.0) {
    return { error: "Multiplier doit être entre 0.1 et 3.0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("seasonal_events").insert({
    name,
    kind,
    start_date,
    end_date,
    staff_multiplier,
    notes,
    is_active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/seasonal");
  revalidatePath("/today");
  return { ok: true };
}

export async function updateSeasonalEventAction(id: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "peak").trim() as SeasonalKind;
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim();
  const multStr = String(formData.get("staff_multiplier") ?? "1.0").trim();
  const staff_multiplier = Number(multStr.replace(",", "."));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !start_date || !end_date) return { error: "Champs requis manquants." };
  if (start_date > end_date) return { error: "La date de fin doit être >= date de début." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("seasonal_events")
    .update({ name, kind, start_date, end_date, staff_multiplier, notes })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/seasonal");
  return { ok: true };
}

export async function toggleSeasonalEventActiveAction(id: string, isActive: boolean) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("seasonal_events")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/seasonal");
  return { ok: true };
}

export async function deleteSeasonalEventAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("seasonal_events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/seasonal");
  return { ok: true };
}

/**
 * Seed des événements 2026-2027 pour la boutique caftans BE.
 * Idempotent : si un événement existe déjà avec ce nom + même start_date, on
 * skip silencieusement.
 *
 * Liste calibrée Karim :
 *   - Soldes janvier (peak ×1.3)
 *   - Ramadan 2026 (low ×0.9 — moins de courses en jour, on rééquilibre)
 *   - Aïd al-Fitr 2026 (peak ×2.0, fenêtre +/-7j)
 *   - Aïd al-Adha 2026 (peak ×1.5)
 *   - Rentrée septembre (low ×0.9)
 *   - Soldes juillet (peak ×1.3)
 *   - Noël / fin d'année (peak ×1.5)
 *   - Idem 2027 (versions roulées + Ramadan/Aïd shiftés selon calendrier islamique)
 */
const SEED_EVENTS: Array<{
  name: string;
  kind: SeasonalKind;
  start_date: string;
  end_date: string;
  staff_multiplier: number;
  notes: string;
}> = [
  // ─── 2026 ───
  {
    name: "Soldes hiver 2026",
    kind: "peak",
    start_date: "2026-01-03",
    end_date: "2026-01-31",
    staff_multiplier: 1.3,
    notes: "Soldes légales d'hiver en Belgique — affluence soutenue surtout en boutique du centre.",
  },
  {
    name: "Ramadan 2026",
    kind: "low",
    start_date: "2026-02-17",
    end_date: "2026-03-19",
    staff_multiplier: 0.9,
    notes: "Période moins de courses en journée, plus le soir. Effectif jour réduit, renfort soir.",
  },
  {
    name: "Aïd al-Fitr 2026 (préparation)",
    kind: "peak",
    start_date: "2026-03-13",
    end_date: "2026-03-26",
    staff_multiplier: 2.0,
    notes: "Pic majeur : essayages, retouches, achats famille. Fenêtre +/-7j autour de la fête.",
  },
  {
    name: "Aïd al-Adha 2026",
    kind: "peak",
    start_date: "2026-05-22",
    end_date: "2026-06-02",
    staff_multiplier: 1.5,
    notes: "Pic secondaire — tenues familiales, achats gift.",
  },
  {
    name: "Soldes été 2026",
    kind: "peak",
    start_date: "2026-07-01",
    end_date: "2026-07-31",
    staff_multiplier: 1.3,
    notes: "Soldes légales d'été. Préparer flying squad inter-sites.",
  },
  {
    name: "Rentrée septembre 2026",
    kind: "low",
    start_date: "2026-09-01",
    end_date: "2026-09-15",
    staff_multiplier: 0.9,
    notes: "Creux post-vacances. Bonne fenêtre pour congés tournants et formations internes.",
  },
  {
    name: "Noël / fin d'année 2026",
    kind: "peak",
    start_date: "2026-12-15",
    end_date: "2026-12-31",
    staff_multiplier: 1.5,
    notes: "Cadeaux + tenues fêtes. Renforcer surtout 17h-21h.",
  },
  // ─── 2027 ───
  {
    name: "Soldes hiver 2027",
    kind: "peak",
    start_date: "2027-01-03",
    end_date: "2027-01-31",
    staff_multiplier: 1.3,
    notes: "Soldes légales d'hiver.",
  },
  {
    name: "Ramadan 2027",
    kind: "low",
    start_date: "2027-02-07",
    end_date: "2027-03-09",
    staff_multiplier: 0.9,
    notes: "Période moins de courses en journée, plus le soir.",
  },
  {
    name: "Aïd al-Fitr 2027 (préparation)",
    kind: "peak",
    start_date: "2027-03-03",
    end_date: "2027-03-16",
    staff_multiplier: 2.0,
    notes: "Pic majeur — essayages massifs, fenêtre +/-7j.",
  },
  {
    name: "Aïd al-Adha 2027",
    kind: "peak",
    start_date: "2027-05-12",
    end_date: "2027-05-23",
    staff_multiplier: 1.5,
    notes: "Pic secondaire.",
  },
  {
    name: "Soldes été 2027",
    kind: "peak",
    start_date: "2027-07-01",
    end_date: "2027-07-31",
    staff_multiplier: 1.3,
    notes: "Soldes légales d'été.",
  },
  {
    name: "Rentrée septembre 2027",
    kind: "low",
    start_date: "2027-09-01",
    end_date: "2027-09-15",
    staff_multiplier: 0.9,
    notes: "Creux post-vacances.",
  },
  {
    name: "Noël / fin d'année 2027",
    kind: "peak",
    start_date: "2027-12-15",
    end_date: "2027-12-31",
    staff_multiplier: 1.5,
    notes: "Cadeaux + tenues fêtes.",
  },
];

export async function seedDefaultSeasonalEventsAction() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  for (const ev of SEED_EVENTS) {
    const { data: existing } = await supabase
      .from("seasonal_events")
      .select("id")
      .eq("name", ev.name)
      .eq("start_date", ev.start_date)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.from("seasonal_events").insert({
      ...ev,
      is_active: true,
    });
    if (error) return { error: error.message, inserted, skipped };
    inserted += 1;
  }
  revalidatePath("/admin/seasonal");
  return { ok: true, inserted, skipped };
}
