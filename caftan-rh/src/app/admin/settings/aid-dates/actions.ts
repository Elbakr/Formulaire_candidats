"use server";

// Server actions pour confirmer ou decaler les dates des Aid (Saghir/Fitr et
// Kabir/Adha). Karim 20/05 : la date precise de l Aid n est confirmee qu une
// poignee de jours avant, donc l interface RH doit permettre d ajuster (+/- 1
// jour) ou de confirmer telle quelle. Decale les 3 entrees liees : J-1, J, J+1.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AidLabel = "fitr" | "adha";

function aidPatternFromLabel(kind: AidLabel): string {
  return kind === "fitr" ? "Aïd al-Fitr" : "Aïd al-Adha";
}

// Trouve les 3 entrees (j-1, j, j+1) d un Aid donne par son "annee musulmane"
// (1447, 1448...) extraite du label "Aïd al-Adha 1447 — j-1" etc.
async function loadAidGroup(kind: AidLabel, hijriYear: number) {
  const supabase = await createClient();
  const labelPrefix = `${aidPatternFromLabel(kind)} ${hijriYear}`;
  const { data, error } = await supabase
    .from("holidays")
    .select("id, date, label, shops_closed, staff_multiplier, is_active, notes")
    .ilike("label", `${labelPrefix}%`)
    .order("date");
  if (error) return { error: error.message, rows: [] as never[] };
  return { rows: data ?? [], error: null };
}

export async function shiftAidByDaysAction(input: {
  kind: AidLabel;
  hijriYear: number;
  delta: number; // -7 to +7
}) {
  await requireRole(["admin"]);
  if (Math.abs(input.delta) > 7) {
    return { error: "Decalage max 7 jours" };
  }
  if (input.delta === 0) {
    return { ok: true, message: "Aucun decalage applique" };
  }
  const supabase = await createClient();
  const { rows, error } = await loadAidGroup(input.kind, input.hijriYear);
  if (error) return { error };
  if (rows.length === 0) {
    return { error: `Aucun Aid ${input.kind} ${input.hijriYear} trouve` };
  }

  // Pour chaque ligne, calcule nouvelle date = old + delta
  const updates: Array<{ id: string; oldDate: string; newDate: string }> = [];
  for (const r of rows as Array<{ id: string; date: string }>) {
    const d = new Date(r.date + "T12:00:00");
    d.setDate(d.getDate() + input.delta);
    const newDate = d.toISOString().slice(0, 10);
    updates.push({ id: r.id, oldDate: r.date, newDate });
  }

  // Applique les updates en 1 vague
  for (const u of updates) {
    const { error: uErr } = await supabase
      .from("holidays")
      .update({ date: u.newDate })
      .eq("id", u.id);
    if (uErr) return { error: `Echec update ${u.id} : ${uErr.message}` };
  }

  // Marque l Aid comme "confirme" via notes (pour que le cron ne re-pingue
  // plus). On marque la ligne du J (shops_closed=true) avec un tag.
  const mainRow = (rows as Array<{ id: string; shops_closed: boolean; notes: string | null }>).find(
    (r) => r.shops_closed === true,
  );
  if (mainRow) {
    const today = new Date().toISOString().slice(0, 10);
    const tag = `Confirme le ${today} (decalage ${input.delta >= 0 ? "+" : ""}${input.delta}j)`;
    await supabase
      .from("holidays")
      .update({ notes: tag })
      .eq("id", mainRow.id);
  }

  revalidatePath("/admin/settings/aid-dates");
  revalidatePath("/admin/holidays");
  return {
    ok: true,
    message: `${updates.length} dates decalees de ${input.delta > 0 ? "+" : ""}${input.delta}j`,
    updates,
  };
}

export async function confirmAidDateAction(input: {
  kind: AidLabel;
  hijriYear: number;
}) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { rows, error } = await loadAidGroup(input.kind, input.hijriYear);
  if (error) return { error };
  const mainRow = (rows as Array<{ id: string; shops_closed: boolean; notes: string | null }>).find(
    (r) => r.shops_closed === true,
  );
  if (!mainRow) return { error: "Pas de ligne J (shops_closed=true) trouvee" };
  const today = new Date().toISOString().slice(0, 10);
  const tag = `Confirme le ${today} (date inchangee)`;
  await supabase.from("holidays").update({ notes: tag }).eq("id", mainRow.id);
  revalidatePath("/admin/settings/aid-dates");
  return { ok: true, message: "Date confirmee" };
}
