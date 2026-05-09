"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function saveCandidateAdminAction(applicationId: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  // Get candidate id from application
  const { data: app } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("id", applicationId)
    .single();
  const candidateId = (app as { candidate_id?: string } | null)?.candidate_id;
  if (!candidateId) return { error: "Candidat introuvable." };

  const get = (k: string) => {
    const v = formData.get(k);
    return v == null ? null : String(v).trim() || null;
  };

  const langs: Record<string, string> = {};
  for (const lang of ["Français", "Arabe", "Néerlandais", "Anglais"]) {
    const v = get(`lang_${lang}`);
    if (v && v !== "none") langs[lang] = v;
  }

  const distance = get("distance_km");
  const payload = {
    full_name: get("full_name"),
    email: get("email")?.toLowerCase(),
    phone: get("phone"),
    birth_date: get("birth_date"),
    birth_place: get("birth_place"),
    nationality: get("nationality"),
    nrn: get("nrn"),
    cin_number: get("cin_number"),
    address: get("address"),
    postal_code: get("postal_code"),
    city: get("city"),
    country: get("country"),
    iban: get("iban"),
    bic: get("bic"),
    bank_holder: get("bank_holder"),
    transport_type: get("transport_type"),
    transport_subscription: get("transport_subscription"),
    transport_price: get("transport_price"),
    distance_km: distance ? Number(distance) : null,
    langs,
    wanted_contract_type: get("wanted_contract_type"),
    work_time_pref: get("work_time_pref"),
    available_from: get("available_from"),
    planned_unavailability: get("planned_unavailability"),
  };

  const { error } = await supabase.from("candidates").update(payload).eq("id", candidateId);
  if (error) return { error: error.message };

  revalidatePath(`/rh/candidates/${applicationId}`);
  return { ok: true };
}
