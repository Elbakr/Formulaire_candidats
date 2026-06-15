"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { closeEmployment } from "@/lib/employment-lifecycle";

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
  /** Heures/semaine proposées (éditables par la RH avant envoi). */
  proposedWeeklyHours?: number | null;
  /** Date de début du nouveau CDD proposée. */
  proposedStartDate?: string | null;
  /** Date de fin du nouveau CDD proposée. */
  proposedEndDate?: string | null;
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

  // Construit le résumé des termes pour la note de décision et les notifs.
  const termsParts: string[] = [];
  if (input.proposedWeeklyHours != null) {
    termsParts.push(`${input.proposedWeeklyHours}h/sem.`);
  }
  if (input.proposedStartDate) termsParts.push(`début ${input.proposedStartDate}`);
  if (input.proposedEndDate) termsParts.push(`fin ${input.proposedEndDate}`);
  const termsLabel = termsParts.length > 0 ? ` (${termsParts.join(", ")})` : "";

  // 1. Persiste statut + termes proposés.
  const updatePayload: Record<string, unknown> = {
    status: "sent",
    decided_by: profile.id,
    decided_at: new Date().toISOString(),
    decision_note: `Proposition de renouvellement envoyée${termsLabel}.`,
  };
  if (input.proposedWeeklyHours != null) {
    updatePayload.proposed_weekly_hours = input.proposedWeeklyHours;
  }
  if (input.proposedStartDate) {
    updatePayload.proposed_start_date = input.proposedStartDate;
  }
  if (input.proposedEndDate) {
    updatePayload.proposed_end_date = input.proposedEndDate;
  }

  const { error: upErr } = await supabase
    .from("cdd_renewal_recommendations")
    .update(updatePayload)
    .eq("id", input.recommendationId);
  if (upErr) return { error: upErr.message };

  // 2. Notification à l'employé (si profil rattaché).
  if (employee.profile_id) {
    await supabase.from("notifications").insert({
      recipient_id: employee.profile_id,
      kind: "cdd_renewal",
      title: `Renouvellement CDD proposé — fin de contrat le ${rec.contract_end_date}`,
      body:
        `Karim te propose de renouveler ton CDD (fin actuelle : ${rec.contract_end_date})${termsLabel}. ` +
        `Ton manager te recontacte prochainement pour finaliser les modalités.`,
      link: "/me",
      data: { recommendation_id: rec.id },
    });
  }
  // 3. Notification au manager.
  if (employee.manager_id) {
    await supabase.from("notifications").insert({
      recipient_id: employee.manager_id,
      kind: "cdd_renewal",
      title: `Renouvellement CDD à finaliser — ${employee.full_name} (fin ${rec.contract_end_date})`,
      body:
        `${employee.full_name} a reçu une proposition de renouvellement (contrat actuel : fin le ${rec.contract_end_date})${termsLabel}. ` +
        `Envoie l'offre formelle (template cdd_renewal_propose) dès que possible.`,
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
      title: `Discussion CDD à organiser — ${employee.full_name} (fin ${rec.contract_end_date})`,
      body: `Karim souhaite échanger avec toi avant la décision de renouvellement de ${employee.full_name} (contrat se terminant le ${rec.contract_end_date}). Prends contact rapidement pour ne pas dépasser le délai.`,
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

  // Karim 2026-06-13 (Phase 3) : non-renouvellement décidé -> clôture automatisée
  // programmée à la date de fin du CDD (archive + Dimona OUT préparée + coupe
  // accès à la date + notice au travailleur). La DÉCISION reste 100% humaine ici.
  try {
    await closeEmployment(createAdminClient(), rec.employee_id, rec.contract_end_date, "non_renewal", { sendNotice: true });
  } catch { /* best-effort */ }

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
