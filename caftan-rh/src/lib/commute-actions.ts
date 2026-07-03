"use server";

// Karim 2026-07-03 : action ADMIN pour (re)calculer le trajet domicile -> 2 sièges
// d'un candidat/employé et le mettre en cache. Déclenchée à la demande (bouton),
// jamais au rendu -> coût Google maîtrisé.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { computeCommute, buildHomeAddress, type CommuteResult } from "@/lib/commute";

export async function computeCommuteAction(
  subjectType: "candidate" | "employee",
  subjectId: string,
): Promise<{ ok: boolean; error?: string; commute?: CommuteResult }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const table = subjectType === "candidate" ? "candidates" : "employees";

  const { data: row } = await admin
    .from(table)
    .select("address, postal_code, city")
    .eq("id", subjectId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Fiche introuvable." };

  const home = buildHomeAddress(row as { address?: string | null; postal_code?: string | null; city?: string | null });
  if (home.replace(/,|\s|Belgium/gi, "").length < 4) {
    return { ok: false, error: "Adresse domicile manquante sur la fiche." };
  }

  let commute: CommuteResult;
  try {
    commute = await computeCommute(home);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await admin.from(table).update({ commute, commute_computed_at: commute.computed_at }).eq("id", subjectId);
  revalidatePath(subjectType === "candidate" ? `/rh/candidates/prevalidated/${subjectId}` : `/planning/employees/${subjectId}`);
  return { ok: true, commute };
}
