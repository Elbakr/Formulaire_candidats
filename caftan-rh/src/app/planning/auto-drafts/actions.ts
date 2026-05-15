"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  commitSitePlanAction,
  previewSitePlanAction,
  type SitePlanPreview,
} from "@/app/planning/sites/[code]/actions";

export async function approveAutoDraftAction(
  draftId: string,
): Promise<{ ok?: boolean; error?: string; created?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("auto_plan_drafts")
    .select("id, status, drafts_json, site_id, week_monday")
    .eq("id", draftId)
    .maybeSingle();
  if (!row) return { error: "Draft introuvable." };
  const r = row as {
    id: string;
    status: string;
    drafts_json: unknown;
    site_id: string;
    week_monday: string;
  };
  if (r.status !== "pending") {
    return { error: `Statut non valide (${r.status}).` };
  }
  const drafts = (r.drafts_json ?? []) as SitePlanPreview["drafts"];
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { error: "Aucun shift à créer dans ce draft." };
  }

  // Snapshot AVANT insert : on liste les shifts existants du site sur la
  // semaine pour pouvoir restaurer en cas de rollback. Les nouveaux ids
  // arrivent apres commitSitePlanAction.
  const weekEnd = (() => {
    const d = new Date(r.week_monday + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();
  const { data: existing } = await supabase
    .from("shifts")
    .select("id")
    .eq("site_id", r.site_id)
    .gte("date", r.week_monday)
    .lte("date", weekEnd);
  const existingIds = ((existing ?? []) as Array<{ id: string }>).map((x) => x.id);

  const commit = await commitSitePlanAction(drafts);
  if (commit.error) return { error: commit.error };

  await supabase
    .from("auto_plan_drafts")
    .update({
      status: "approved",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      applied_snapshot_json: {
        new_shift_ids: commit.new_shift_ids ?? [],
        existing_shift_ids: existingIds,
      },
    })
    .eq("id", draftId);
  revalidatePath("/planning/auto-drafts");
  revalidatePath("/planning/calendar");
  return { ok: true, created: commit.created };
}

/**
 * Rollback en 1 clic des shifts crees par approveAutoDraftAction.
 * Lit applied_snapshot_json.new_shift_ids, supprime ces shifts, marque le
 * draft rolled_back. Disponible 24h apres l'application (UI), pas de limite
 * cote serveur. Decision Karim 2026-05-12 (auto-planning multi-sites).
 */
export async function rollbackAutoDraftAction(
  draftId: string,
): Promise<{ ok?: boolean; error?: string; removed?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("auto_plan_drafts")
    .select("id, status, applied_snapshot_json, rolled_back_at")
    .eq("id", draftId)
    .maybeSingle();
  if (!row) return { error: "Draft introuvable." };
  const r = row as {
    id: string;
    status: string;
    applied_snapshot_json: { new_shift_ids?: string[] } | null;
    rolled_back_at: string | null;
  };
  if (r.rolled_back_at) return { error: "Déjà rollback." };
  if (r.status !== "approved") return { error: `Statut non valide (${r.status}).` };
  const ids = r.applied_snapshot_json?.new_shift_ids ?? [];
  if (ids.length === 0) {
    // Marque quand meme rolled_back pour cacher le bouton
    await supabase
      .from("auto_plan_drafts")
      .update({ rolled_back_at: new Date().toISOString() })
      .eq("id", draftId);
    return { ok: true, removed: 0 };
  }
  const { error, count } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return { error: error.message };

  await supabase
    .from("auto_plan_drafts")
    .update({
      rolled_back_at: new Date().toISOString(),
      decided_by: profile.id,
    })
    .eq("id", draftId);
  revalidatePath("/planning/auto-drafts");
  revalidatePath("/planning/calendar");
  return { ok: true, removed: count ?? ids.length };
}

/**
 * Genere des previews de planning pour N sites (decision Karim 2026-05-12
 * pour le multi-sites + 2026-05-13 pour l'anti-double-booking) : N'ecrit
 * rien en DB mais traite les sites SEQUENTIELLEMENT et FILTRE les drafts
 * de chaque site qui chevauchent les drafts deja proposes pour un site
 * precedent. Un employe ne peut pas etre a 2 endroits en meme temps.
 */
export async function previewMultiSitePlanAction(
  siteCodes: string[],
  weekISO: string,
): Promise<{
  items: Array<{
    site_code: string;
    preview?: SitePlanPreview;
    error?: string;
  }>;
  /** Ordre de traitement choisi par le solver pour la repartition equilibree.
   *  Karim 15/05/2026 : "la repartition equitable entre site est essentielle". */
  processingOrder?: Array<{ site_code: string; criticality_score: number }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  if (siteCodes.length === 0) return { items: [] };

  // Karim 15/05 : tri par criticite DESC avant d enchainer les sites. Sans
  // ce tri, le 1er site clique rafle tous les employes disponibles et les
  // sites suivants restent vides. La criticite = somme (headcount * duree
  // * (1 + is_critical)) sur les besoins is_enabled du site (chaque besoin
  // ultra-critique pese 3x, critique 2x, normal 1x).
  const supabase = await createClient();
  const { data: sitesRaw } = await supabase
    .from("sites")
    .select("id, code")
    .in("code", siteCodes.map((c) => c.toUpperCase()));
  const siteIdByCode = new Map<string, string>();
  for (const s of (sitesRaw ?? []) as Array<{ id: string; code: string }>) {
    siteIdByCode.set(s.code.toUpperCase(), s.id);
  }
  const siteIds = [...siteIdByCode.values()];

  const { data: needsRaw } = await supabase
    .from("site_needs")
    .select("site_id, start_time, end_time, headcount, is_critical, is_enabled")
    .in("site_id", siteIds)
    .eq("is_enabled", true);

  function slotDurHours(s: string, e: string): number {
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  }
  const scoreBySiteId = new Map<string, number>();
  for (const n of (needsRaw ?? []) as Array<{
    site_id: string;
    start_time: string;
    end_time: string;
    headcount: number;
    is_critical: number | null;
  }>) {
    const dur = slotDurHours(n.start_time, n.end_time);
    const weight = 1 + (n.is_critical ?? 0); // 1=normal, 2=critique, 3=ultra
    const s = dur * Math.max(1, n.headcount) * weight;
    scoreBySiteId.set(n.site_id, (scoreBySiteId.get(n.site_id) ?? 0) + s);
  }

  const sortedCodes = [...siteCodes].sort((a, b) => {
    const idA = siteIdByCode.get(a.toUpperCase());
    const idB = siteIdByCode.get(b.toUpperCase());
    const scoreA = idA ? (scoreBySiteId.get(idA) ?? 0) : 0;
    const scoreB = idB ? (scoreBySiteId.get(idB) ?? 0) : 0;
    return scoreB - scoreA; // DESC : critique d abord
  });

  const processingOrder = sortedCodes.map((code) => {
    const id = siteIdByCode.get(code.toUpperCase());
    return {
      site_code: code,
      criticality_score: id ? (scoreBySiteId.get(id) ?? 0) : 0,
    };
  });
  console.log(`[previewMultiSite] ordre traitement par criticite :`, processingOrder);

  const results: Array<{ site_code: string; preview?: SitePlanPreview; error?: string }> = [];
  // Map des creneaux deja pris par employe/date au cours de ce preview batch
  const takenByEmpDate = new Map<string, Array<{ start: string; end: string }>>();

  for (const code of sortedCodes) {
    const r = await previewSitePlanAction(code, weekISO);
    if ("error" in r) {
      console.log(`[previewMultiSite] ${code} ${weekISO} ERROR: ${r.error}`);
      results.push({ site_code: code, error: r.error });
      continue;
    }
    console.log(`[previewMultiSite] ${code} ${weekISO} : ${r.drafts.length} drafts initiaux, ${r.uncovered.length} uncovered initiaux`);
    // Filtre les drafts qui chevauchent ce qui a deja ete propose pour un
    // autre site dans ce meme batch.
    const kept: typeof r.drafts = [];
    const blocked: typeof r.drafts = [];
    for (const d of r.drafts) {
      const k = `${d.employee_id}|${d.date}`;
      const existing = takenByEmpDate.get(k) ?? [];
      const overlap = existing.some((e) => d.start_time < e.end && d.end_time > e.start);
      if (overlap) {
        blocked.push(d);
        continue;
      }
      kept.push(d);
      existing.push({ start: d.start_time, end: d.end_time });
      takenByEmpDate.set(k, existing);
    }
    console.log(`[previewMultiSite] ${code} ${weekISO} : ${kept.length} kept, ${blocked.length} bloques par double-booking`);
    // Les drafts bloques deviennent des "uncovered" (effectif manquant) sur
    // leur creneau original pour ce site, afin que Karim voit la realite.
    const additionalUncovered: SitePlanPreview["uncovered"] = blocked.map((d) => ({
      date: d.date,
      day_label: new Date(d.date + "T00:00:00").toLocaleDateString("fr-BE", { weekday: "short" }),
      start_time: d.start_time,
      end_time: d.end_time,
      role: d.position ?? null,
      missing: 1,
      reason: `${d.employee_name} déjà programmé(e) sur un autre site ce jour-là`,
    }));
    results.push({
      site_code: code,
      preview: {
        ...r,
        drafts: kept,
        uncovered: [...r.uncovered, ...additionalUncovered],
      },
    });
  }

  // Karim 15/05 : preserve l ordre d input pour l UI (l ordre user-clic),
  // meme si on a traite les sites dans l ordre de criticite cote solver.
  const orderedResults = siteCodes.map((c) => results.find((r) => r.site_code === c)).filter(
    (r): r is { site_code: string; preview?: SitePlanPreview; error?: string } => Boolean(r),
  );

  return { items: orderedResults, processingOrder };
}

/**
 * Applique un batch de previews multi-sites. Pour chaque preview :
 *   1. INSERT dans auto_plan_drafts (status='pending')
 *   2. Appelle approveAutoDraftAction qui basculera dans shifts + stockera
 *      le snapshot pour rollback.
 * Retourne par site le draft_id + count cree (ou error).
 */
export async function commitMultiSitePlanAction(
  items: Array<{
    site_id: string;
    site_code: string;
    week_monday: string;
    drafts: SitePlanPreview["drafts"];
    uncovered: SitePlanPreview["uncovered"];
    contract_usage?: SitePlanPreview["contract_usage"];
  }>,
): Promise<{
  results: Array<{
    site_code: string;
    ok?: boolean;
    draft_id?: string;
    created?: number;
    error?: string;
  }>;
}> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const results: Array<{
    site_code: string;
    ok?: boolean;
    draft_id?: string;
    created?: number;
    error?: string;
  }> = [];

  for (const item of items) {
    if (item.drafts.length === 0) {
      results.push({ site_code: item.site_code, ok: true, created: 0 });
      continue;
    }
    const { data: inserted, error: insErr } = await supabase
      .from("auto_plan_drafts")
      .insert({
        site_id: item.site_id,
        week_monday: item.week_monday,
        status: "pending",
        drafts_json: item.drafts,
        uncovered_json: item.uncovered,
        contract_usage_json: item.contract_usage ?? null,
        generated_at: new Date().toISOString(),
        generated_by: profile.id,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      results.push({ site_code: item.site_code, error: insErr?.message ?? "Insert draft failed" });
      continue;
    }
    const r = await approveAutoDraftAction((inserted as { id: string }).id);
    if (r.error) {
      results.push({ site_code: item.site_code, error: r.error });
      continue;
    }
    results.push({
      site_code: item.site_code,
      ok: true,
      draft_id: (inserted as { id: string }).id,
      created: r.created,
    });
  }
  revalidatePath("/planning", "layout");
  return { results };
}

/**
 * Rollback tous les drafts approuves sur une semaine donnee dans les
 * dernieres 24h. Permet d'annuler une generation multi-sites en 1 clic.
 */
export async function rollbackRecentDraftsAction(
  weekISO: string,
): Promise<{ ok?: boolean; error?: string; rolled_back?: number; removed?: number }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: drafts } = await supabase
    .from("auto_plan_drafts")
    .select("id")
    .eq("week_monday", weekISO)
    .eq("status", "approved")
    .is("rolled_back_at", null)
    .gte("applied_at", cutoff);
  const rows = (drafts ?? []) as Array<{ id: string }>;
  if (rows.length === 0) return { ok: true, rolled_back: 0, removed: 0 };

  let removed = 0;
  for (const d of rows) {
    const r = await rollbackAutoDraftAction(d.id);
    if (r.ok) removed += r.removed ?? 0;
  }
  return { ok: true, rolled_back: rows.length, removed };
}

export async function rejectAutoDraftAction(
  draftId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_plan_drafts")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  if (error) return { error: error.message };
  revalidatePath("/planning/auto-drafts");
  return { ok: true };
}
