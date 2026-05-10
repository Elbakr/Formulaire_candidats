"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

async function loadRecord(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cdd_renewal_recommendations")
    .select("id, employee_id, contract_end_date, status, rationale")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Recommandation introuvable.");
  return data as unknown as {
    id: string;
    employee_id: string;
    contract_end_date: string;
    status: string;
    rationale: string;
  };
}

export async function updateRationaleAction(input: {
  recommendationId: string;
  rationale: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const text = input.rationale.trim();
  if (!text) return { error: "Le texte de justification ne peut pas être vide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cdd_renewal_recommendations")
    .update({ rationale: text })
    .eq("id", input.recommendationId);
  if (error) return { error: error.message };
  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}

export async function sendRenewalProposalAction(input: {
  recommendationId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const rec = await loadRecord(input.recommendationId);
  if (rec.status !== "pending") {
    return { error: `Statut courant : ${rec.status}.` };
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, profile_id, email, manager_id")
    .eq("id", rec.employee_id)
    .maybeSingle();
  type EmpRow = {
    id: string;
    full_name: string;
    profile_id: string | null;
    email: string;
    manager_id: string | null;
  };
  const employee = emp as unknown as EmpRow | null;
  if (!employee) return { error: "Employé introuvable." };

  // 1. Update statut.
  const { error: upErr } = await supabase
    .from("cdd_renewal_recommendations")
    .update({
      status: "sent",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_note: "Proposition de renouvellement envoyée.",
    })
    .eq("id", input.recommendationId);
  if (upErr) return { error: upErr.message };

  // 2. Notification à l'employé (si profil rattaché).
  if (employee.profile_id) {
    await supabase.from("notifications").insert({
      recipient_id: employee.profile_id,
      kind: "cdd_renewal",
      title: "Renouvellement de contrat proposé",
      body: `Karim te propose de renouveler ton CDD (fin actuelle : ${rec.contract_end_date}). Ton manager te recontacte prochainement.`,
      link: "/me",
      data: { recommendation_id: rec.id },
    });
  }
  // 3. Notification au manager.
  if (employee.manager_id) {
    await supabase.from("notifications").insert({
      recipient_id: employee.manager_id,
      kind: "cdd_renewal",
      title: "Proposition de renouvellement à finaliser",
      body: `${employee.full_name} : envoie l'offre formelle (template cdd_renewal_propose).`,
      link: "/admin/cdd-renewals",
      data: { recommendation_id: rec.id },
    });
  }

  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}

export async function discussRenewalAction(input: {
  recommendationId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const rec = await loadRecord(input.recommendationId);
  if (rec.status !== "pending" && rec.status !== "discussing") {
    return { error: `Statut courant : ${rec.status}.` };
  }
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, manager_id")
    .eq("id", rec.employee_id)
    .maybeSingle();
  type EmpRow = { id: string; full_name: string; manager_id: string | null };
  const employee = emp as unknown as EmpRow | null;
  if (!employee) return { error: "Employé introuvable." };

  const { error: upErr } = await supabase
    .from("cdd_renewal_recommendations")
    .update({
      status: "discussing",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_note: "Renvoyé au manager pour discussion.",
    })
    .eq("id", input.recommendationId);
  if (upErr) return { error: upErr.message };

  if (employee.manager_id) {
    await supabase.from("notifications").insert({
      recipient_id: employee.manager_id,
      kind: "cdd_renewal",
      title: `Discussion CDD à organiser — ${employee.full_name}`,
      body: `Karim souhaite échanger avec toi avant la décision de renouvellement.`,
      link: "/admin/cdd-renewals",
      data: { recommendation_id: rec.id },
    });
  }
  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}

export async function rejectRenewalAction(input: {
  recommendationId: string;
  decisionNote: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const note = input.decisionNote.trim();
  if (!note) return { error: "Une justification est obligatoire pour un non-renouvellement." };
  const supabase = await createClient();
  const rec = await loadRecord(input.recommendationId);
  if (!["pending", "discussing"].includes(rec.status)) {
    return { error: `Statut courant : ${rec.status}.` };
  }

  const { error: upErr } = await supabase
    .from("cdd_renewal_recommendations")
    .update({
      status: "rejected_by_admin",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", input.recommendationId);
  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}

export async function archiveRenewalAction(input: {
  recommendationId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("cdd_renewal_recommendations")
    .update({ status: "archived" })
    .eq("id", input.recommendationId);
  if (error) return { error: error.message };
  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}

export async function rerunRecommendationAction(input: {
  employeeId: string;
  contractEndDate: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  // Lazy import (server-only).
  const { buildRenewalRecommendation } = await import("@/lib/cdd-renewal-engine");
  const supabase = await createClient();
  const fresh = await buildRenewalRecommendation(input.employeeId);
  const { error } = await supabase
    .from("cdd_renewal_recommendations")
    .upsert(
      {
        employee_id: input.employeeId,
        contract_end_date: input.contractEndDate,
        recommendation: fresh.recommendation,
        rationale: fresh.rationale,
        global_score: fresh.global_score,
        trends: fresh.trends,
        site_load_forecast: fresh.site_load_forecast,
        status: "pending",
      },
      { onConflict: "employee_id,contract_end_date" },
    );
  if (error) return { error: error.message };
  revalidatePath("/admin/cdd-renewals");
  return { ok: true };
}
