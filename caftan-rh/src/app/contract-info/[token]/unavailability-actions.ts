"use server";

// Karim 2026-07-03 : indisponibilités déclarées par le CANDIDAT pré-validé
// (étape 2 du formulaire /contract-info). Flux TOKEN public (pas d'auth) : on
// résout le candidat depuis le token, on n'expose jamais d'autre candidat.

import { createAdminClient } from "@/lib/supabase/server";

type AddInput = {
  mode: "recurring" | "specific";
  day_of_week?: number | null;
  date_specific?: string | null;
  date_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
  notes?: string | null;
};

async function candidateIdFromToken(admin: ReturnType<typeof createAdminClient>, token: string): Promise<string | null> {
  const { data } = await admin
    .from("contract_info_tokens")
    .select("candidate_id")
    .eq("token", token)
    .maybeSingle();
  return (data as { candidate_id: string | null } | null)?.candidate_id ?? null;
}

export async function addCandidateUnavailabilityAction(
  token: string,
  input: AddInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = createAdminClient();
  const candidateId = await candidateIdFromToken(admin, token);
  if (!candidateId) return { ok: false, error: "Lien invalide" };

  const clean = (s?: string | null) => {
    const v = (s ?? "").trim();
    return v === "" ? null : v;
  };

  const row: Record<string, unknown> = {
    candidate_id: candidateId,
    reason: clean(input.reason),
    notes: clean(input.notes),
    start_time: clean(input.start_time),
    end_time: clean(input.end_time),
    is_active: true,
  };

  if (input.mode === "recurring") {
    const dow = Number(input.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return { ok: false, error: "Jour invalide" };
    row.day_of_week = dow;
    row.date_specific = null;
  } else {
    const date = clean(input.date_specific);
    if (!date) return { ok: false, error: "Date requise" };
    row.date_specific = date;
    row.day_of_week = null;
    // Période optionnelle (vacances du..au). Ignorée si <= date de début.
    const end = clean(input.date_end);
    row.date_end = end && end > date ? end : null;
  }

  const { data, error } = await admin
    .from("candidate_unavailabilities")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteCandidateUnavailabilityAction(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const candidateId = await candidateIdFromToken(admin, token);
  if (!candidateId) return { ok: false, error: "Lien invalide" };
  // Ne supprime QUE si la ligne appartient au candidat du token.
  const { error } = await admin
    .from("candidate_unavailabilities")
    .delete()
    .eq("id", id)
    .eq("candidate_id", candidateId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
