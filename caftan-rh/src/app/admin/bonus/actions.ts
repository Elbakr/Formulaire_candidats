"use server";

// Server actions pour /admin/bonus — primes / concours équipe.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export type BonusRuleKind =
  | "top_attendance"
  | "top_score"
  | "top_seller"
  | "no_absence"
  | "custom";

export type PrizeDistributionEntry = { rank: number; amount: number };

// ─── CRUD campagnes ────────────────────────────────────────────────────────

export async function createBonusCampaignAction(formData: FormData) {
  await requireRole(["admin", "rh"]);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim();
  const rule_kind = String(formData.get("rule_kind") ?? "top_attendance").trim() as BonusRuleKind;
  const budget_total_str = String(formData.get("budget_total") ?? "").trim();
  const per_person_max_str = String(formData.get("per_person_max") ?? "").trim();
  const distribution_str = String(formData.get("prize_distribution") ?? "[]").trim();
  const scope_site_id = String(formData.get("scope_site_id") ?? "").trim() || null;

  if (!name) return { error: "Nom requis." };
  if (!start_date || !end_date) return { error: "Dates requises." };
  if (start_date > end_date) return { error: "Date fin doit être >= date début." };
  if (
    !["top_attendance", "top_score", "top_seller", "no_absence", "custom"].includes(rule_kind)
  ) {
    return { error: "Règle invalide." };
  }

  let prize_distribution: PrizeDistributionEntry[] = [];
  try {
    const parsed = JSON.parse(distribution_str);
    if (Array.isArray(parsed)) {
      prize_distribution = parsed
        .filter((e) => e && typeof e === "object")
        .map((e) => ({
          rank: Number(e.rank ?? 0),
          amount: Number(e.amount ?? 0),
        }))
        .filter((e) => e.rank > 0 && e.amount > 0)
        .sort((a, b) => a.rank - b.rank);
    }
  } catch {
    return { error: "Distribution prix invalide (JSON malformé)." };
  }

  const budget_total = budget_total_str ? Number(budget_total_str.replace(",", ".")) : null;
  const per_person_max = per_person_max_str ? Number(per_person_max_str.replace(",", ".")) : null;

  const supabase = await createClient();
  const { error } = await supabase.from("bonus_campaigns").insert({
    name,
    description,
    start_date,
    end_date,
    rule_kind,
    budget_total,
    per_person_max,
    prize_distribution,
    scope_site_id,
    is_active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}

export async function toggleBonusCampaignActiveAction(id: string, isActive: boolean) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bonus_campaigns")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}

export async function deleteBonusCampaignAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("bonus_campaigns").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}

// ─── Calcul des gagnants ──────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  rule_kind: BonusRuleKind;
  budget_total: number | null;
  per_person_max: number | null;
  prize_distribution: PrizeDistributionEntry[] | null;
  scope_site_id: string | null;
};

/**
 * Calcule les gagnants selon `rule_kind` et insère dans `bonus_awards`.
 * Idempotent : on supprime d'abord les awards existants de la campagne pour
 * permettre le recalcul (ex. erreur de fenêtre, données ajustées).
 *
 * Retour : count créés + breakdown par employé.
 */
export async function computeAndAwardCampaignAction(campaignId: string) {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: cRaw, error: cErr } = await supabase
    .from("bonus_campaigns")
    .select(
      "id, name, start_date, end_date, rule_kind, budget_total, per_person_max, prize_distribution, scope_site_id",
    )
    .eq("id", campaignId)
    .single();
  if (cErr || !cRaw) return { error: "Campagne introuvable." };
  const c = cRaw as Campaign;

  if (c.rule_kind === "top_seller") {
    return {
      error:
        "Non disponible — l'attribution top_seller nécessite l'intégration WooCommerce (V2).",
    };
  }
  if (c.rule_kind === "custom") {
    return {
      error:
        "Règle « custom » : utilise l'attribution manuelle (bouton « + Awarder » sur la campagne).",
    };
  }

  // Distribution → map rank → amount. Utile pour top_attendance / top_score.
  const distribution = (c.prize_distribution ?? []) as PrizeDistributionEntry[];
  const distMap = new Map<number, number>();
  for (const d of distribution) distMap.set(d.rank, d.amount);
  const maxRank = distribution.length > 0 ? Math.max(...distribution.map((d) => d.rank)) : 0;

  // Liste candidate des employés selon scope_site_id.
  const empIds: string[] = [];
  if (c.scope_site_id) {
    const { data: assigns } = await supabase
      .from("site_assignments")
      .select("employee_id, end_date")
      .eq("site_id", c.scope_site_id)
      .lte("start_date", c.end_date)
      .or(`end_date.is.null,end_date.gte.${c.start_date}`);
    for (const a of (assigns ?? []) as Array<{ employee_id: string }>) {
      if (!empIds.includes(a.employee_id)) empIds.push(a.employee_id);
    }
  } else {
    const { data: emps } = await supabase
      .from("employees")
      .select("id")
      .eq("status", "active");
    for (const e of (emps ?? []) as Array<{ id: string }>) empIds.push(e.id);
  }
  if (empIds.length === 0) {
    return { error: "Aucun employé éligible (scope vide)." };
  }

  // Charge les noms (pour reason explicable).
  const { data: empRows } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", empIds);
  const nameById = new Map<string, string>();
  for (const e of (empRows ?? []) as Array<{ id: string; full_name: string }>) {
    nameById.set(e.id, e.full_name);
  }

  // Reset awards existants (idempotent recalcul).
  await supabase.from("bonus_awards").delete().eq("campaign_id", c.id);

  // Calcule selon la règle.
  type Award = {
    employee_id: string;
    amount: number;
    rank: number | null;
    reason: string;
  };
  const awards: Award[] = [];

  if (c.rule_kind === "top_attendance") {
    // Heures pointées (clock_sessions.duration_minutes) sans anomalie critique.
    const { data: sessions } = await supabase
      .from("clock_sessions")
      .select("employee_id, clock_in_at, duration_minutes")
      .in("employee_id", empIds)
      .gte("clock_in_at", `${c.start_date}T00:00:00`)
      .lte("clock_in_at", `${c.end_date}T23:59:59`);
    type Session = {
      employee_id: string;
      clock_in_at: string;
      duration_minutes: number | null;
    };
    const sessArr = (sessions ?? []) as Session[];

    // Charge les anomalies critiques sur la fenêtre pour exclure ces employés.
    // Schéma : target_type='employee', target_id=employee_id, detected_at.
    const { data: anomalies } = await supabase
      .from("anomaly_flags")
      .select("target_id, severity, detected_at")
      .eq("target_type", "employee")
      .in("target_id", empIds)
      .eq("severity", "critical")
      .gte("detected_at", `${c.start_date}T00:00:00`)
      .lte("detected_at", `${c.end_date}T23:59:59`);
    const flaggedSet = new Set(
      ((anomalies ?? []) as Array<{ target_id: string }>).map((a) => a.target_id),
    );

    const totalsByEmp = new Map<string, number>();
    for (const s of sessArr) {
      if (flaggedSet.has(s.employee_id)) continue;
      const cur = totalsByEmp.get(s.employee_id) ?? 0;
      totalsByEmp.set(s.employee_id, cur + (s.duration_minutes ?? 0) / 60);
    }

    const sorted = [...totalsByEmp.entries()]
      .filter(([, h]) => h > 0)
      .sort((a, b) => b[1] - a[1]);

    for (let i = 0; i < sorted.length && i < maxRank; i++) {
      const [empId, hours] = sorted[i];
      const rank = i + 1;
      const amount = distMap.get(rank);
      if (!amount) continue;
      awards.push({
        employee_id: empId,
        amount,
        rank,
        reason: `Top ${rank} présence : ${hours.toFixed(1)} h pointées sur la période, sans anomalie critique.`,
      });
    }
  } else if (c.rule_kind === "top_score") {
    // Score moyen (table evaluations.total) sur la fenêtre.
    const { data: evals } = await supabase
      .from("evaluations")
      .select("employee_id, total, period_end")
      .in("employee_id", empIds)
      .gte("period_end", c.start_date)
      .lte("period_end", c.end_date);
    type EvalRow = {
      employee_id: string;
      total: number | null;
    };
    const evalArr = (evals ?? []) as EvalRow[];

    const sumsByEmp = new Map<string, { sum: number; count: number }>();
    for (const e of evalArr) {
      if (e.total == null) continue;
      const cur = sumsByEmp.get(e.employee_id) ?? { sum: 0, count: 0 };
      cur.sum += e.total;
      cur.count += 1;
      sumsByEmp.set(e.employee_id, cur);
    }
    const avgsByEmp = [...sumsByEmp.entries()].map(([id, v]) => ({
      id,
      avg: v.sum / Math.max(1, v.count),
      n: v.count,
    }));
    const sorted = avgsByEmp.sort((a, b) => b.avg - a.avg);

    for (let i = 0; i < sorted.length && i < maxRank; i++) {
      const e = sorted[i];
      const rank = i + 1;
      const amount = distMap.get(rank);
      if (!amount) continue;
      awards.push({
        employee_id: e.id,
        amount,
        rank,
        reason: `Top ${rank} score : moyenne ${e.avg.toFixed(2)} sur ${e.n} évaluation(s).`,
      });
    }
  } else if (c.rule_kind === "no_absence") {
    // Tous les employés sans absence imprévue sur la période.
    const { data: abs } = await supabase
      .from("unplanned_absences")
      .select("employee_id, date")
      .in("employee_id", empIds)
      .gte("date", c.start_date)
      .lte("date", c.end_date);
    const absentSet = new Set(
      ((abs ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id),
    );

    const cleanIds = empIds.filter((id) => !absentSet.has(id));
    // Montant : per_person_max si défini, sinon budget_total / N.
    let amountPer = c.per_person_max ?? 0;
    if (!amountPer && c.budget_total && cleanIds.length > 0) {
      amountPer = Math.floor((c.budget_total / cleanIds.length) * 100) / 100;
    }
    if (!amountPer) amountPer = 25; // fallback raisonnable

    for (const id of cleanIds) {
      awards.push({
        employee_id: id,
        amount: amountPer,
        rank: null,
        reason: `Aucune absence imprévue du ${c.start_date} au ${c.end_date}.`,
      });
    }
  }

  if (awards.length === 0) {
    return { ok: true, created: 0, message: "Aucun gagnant calculé sur cette période." };
  }

  const rows = awards.map((a) => ({
    campaign_id: c.id,
    employee_id: a.employee_id,
    amount: a.amount,
    rank: a.rank,
    reason: a.reason,
  }));
  const { error: insErr } = await supabase.from("bonus_awards").insert(rows);
  if (insErr) return { error: insErr.message };

  await logActivity({
    kind: "bonus.campaign_computed",
    targetType: "campaign",
    targetId: c.id,
    description: `Campagne « ${c.name} » : ${awards.length} gagnant(s) calculés.`,
    data: { rule_kind: c.rule_kind, count: awards.length },
    actorId: profile.id,
    actorLabel: profile.full_name?.trim() || profile.email || "RH",
  });

  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  revalidatePath("/me/today");
  return {
    ok: true,
    created: awards.length,
    breakdown: awards.map((a) => ({
      employee_id: a.employee_id,
      employee_name: nameById.get(a.employee_id) ?? "—",
      rank: a.rank,
      amount: a.amount,
      reason: a.reason,
    })),
  };
}

// ─── Award manuel (custom / ajustement) ──────────────────────────────────

export async function manualAwardAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const campaign_id = String(formData.get("campaign_id") ?? "").trim();
  const employee_id = String(formData.get("employee_id") ?? "").trim();
  const amount = Number(String(formData.get("amount") ?? "0").replace(",", "."));
  const rank_str = String(formData.get("rank") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "Award manuel";

  if (!campaign_id || !employee_id) return { error: "Campagne et employé requis." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Montant invalide." };
  const rank = rank_str ? Number(rank_str) : null;

  const supabase = await createClient();
  // Upsert sur (campaign_id, employee_id) — la contrainte UNIQUE existe.
  const { error } = await supabase
    .from("bonus_awards")
    .upsert(
      {
        campaign_id,
        employee_id,
        amount,
        rank,
        reason,
      },
      { onConflict: "campaign_id,employee_id" },
    );
  if (error) return { error: error.message };
  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}

export async function markAwardPaidAction(awardId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bonus_awards")
    .update({ paid_at: new Date().toISOString() })
    .eq("id", awardId);
  if (error) return { error: error.message };
  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}

export async function deleteAwardAction(awardId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("bonus_awards").delete().eq("id", awardId);
  if (error) return { error: error.message };
  revalidatePath("/admin/bonus");
  revalidatePath("/me/my-bonus");
  return { ok: true };
}
