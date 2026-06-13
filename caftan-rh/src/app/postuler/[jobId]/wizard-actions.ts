"use server";

// Karim 2026-06-13 (Phase 1bis) : assistant de candidature multi-écrans avec
// SYNCHRONISATION DB PROGRESSIVE. La candidature est créée dès l'écran 1
// (status='draft', visible RH pour le suivi des abandons) ; chaque écran met à
// jour la fiche candidat ; le dernier écran finalise (draft -> new).
//
// Sécurité : on utilise le service-role (admin) MAIS on vérifie toujours que la
// candidature appartient bien au profil connecté (candidates.profile_id).

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  computeCandidateScore,
  type CandidateForScoring,
} from "@/lib/scoring/candidate-match-score";
import { sendApplicationAcknowledgement } from "@/lib/emails";

type Flat = Record<string, unknown>;

// Colonnes directes de `candidates`.
const DIRECT_COLS = [
  "email", "phone", "birth_date", "address", "postal_code", "city",
  "country", "nrn", "wanted_contract_type", "available_from",
] as const;
// Champs sans colonne dédiée -> stockés dans raw_payload (comme le formulaire public).
const RAW_KEYS = [
  "gender", "days_available", "work_permit", "brussels_plans",
  "activa_brussels", "position", "experience", "site_preference",
] as const;

async function sessionUser() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  return user;
}

type DraftResult = {
  applicationId?: string;
  candidateId?: string;
  candidate?: Record<string, unknown>;
  motivation?: string | null;
  error?: string;
};

export async function ensureDraftApplication(jobId: string | null): Promise<DraftResult> {
  const user = await sessionUser();
  if (!user) return { error: "not_authenticated" };
  const admin = createAdminClient();

  const { data: cands } = await admin
    .from("candidates").select("id").eq("profile_id", user.id);
  const candIds = ((cands ?? []) as Array<{ id: string }>).map((c) => c.id);

  let appRow: { id: string; candidate_id: string; motivation: string | null } | null = null;
  if (candIds.length > 0) {
    const { data } = await admin
      .from("applications")
      .select("id, candidate_id, status, job_id, motivation")
      .in("candidate_id", candIds)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50);
    const match = ((data ?? []) as Array<{ id: string; candidate_id: string; job_id: string | null; motivation: string | null }>)
      .find((a) => (a.job_id ?? null) === (jobId ?? null));
    if (match) appRow = { id: match.id, candidate_id: match.candidate_id, motivation: match.motivation };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, string>;

  if (!appRow) {
    const { data: cand, error: cErr } = await admin
      .from("candidates")
      .insert({
        email: user.email ?? meta.email ?? null,
        full_name: meta.full_name ?? "",
        birth_date: meta.birth_date || null,
        postal_code: meta.postal_code || null,
        city: meta.city || null,
        country: "BE",
        source: "candidate_account",
        profile_id: user.id,
        raw_payload: { source: "candidate_account", started_at: new Date().toISOString() },
      })
      .select("id").single();
    if (cErr || !cand) return { error: cErr?.message ?? "Création brouillon échouée." };
    const { data: app, error: aErr } = await admin
      .from("applications")
      .insert({ candidate_id: (cand as { id: string }).id, job_id: jobId, status: "draft" })
      .select("id").single();
    if (aErr || !app) return { error: aErr?.message ?? "Création candidature échouée." };
    appRow = { id: (app as { id: string }).id, candidate_id: (cand as { id: string }).id, motivation: null };
  }

  const { data: cand } = await admin
    .from("candidates").select("*").eq("id", appRow.candidate_id).single();
  return {
    applicationId: appRow.id,
    candidateId: appRow.candidate_id,
    candidate: (cand ?? {}) as Record<string, unknown>,
    motivation: appRow.motivation,
  };
}

async function ownedDraft(admin: ReturnType<typeof createAdminClient>, applicationId: string, userId: string) {
  const { data } = await admin
    .from("applications")
    .select("id, candidate_id, status, candidate:candidates(profile_id, raw_payload)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string; candidate_id: string; status: string;
    candidate: { profile_id: string | null; raw_payload: Record<string, unknown> | null } | { profile_id: string | null; raw_payload: Record<string, unknown> | null }[];
  };
  const cand = Array.isArray(row.candidate) ? row.candidate[0] : row.candidate;
  if (!cand || cand.profile_id !== userId) return null;
  return { id: row.id, candidate_id: row.candidate_id, status: row.status, raw: cand.raw_payload ?? {} };
}

function buildCandidateUpdate(partial: Flat, existingRaw: Record<string, unknown>): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  for (const k of DIRECT_COLS) if (k in partial) upd[k] = partial[k] === "" ? null : partial[k];
  if ("firstname" in partial || "lastname" in partial) {
    upd.full_name = `${(partial.firstname as string) ?? ""} ${(partial.lastname as string) ?? ""}`.trim();
  }
  if ("langs" in partial) upd.langs = partial.langs ?? {};
  if ("weekly_hours" in partial) {
    const w = String(partial.weekly_hours ?? "").trim();
    upd.work_time_pref = w ? `${w}h/sem` : null;
  }
  const rawMerge: Record<string, unknown> = {};
  for (const k of RAW_KEYS) if (k in partial) rawMerge[k] = partial[k];
  if (Object.keys(rawMerge).length > 0) upd.raw_payload = { ...existingRaw, ...rawMerge };
  return upd;
}

export async function saveApplicationStep(applicationId: string, partial: Flat): Promise<{ ok?: true; error?: string }> {
  const user = await sessionUser();
  if (!user) return { error: "not_authenticated" };
  const admin = createAdminClient();
  const draft = await ownedDraft(admin, applicationId, user.id);
  if (!draft) return { error: "Candidature introuvable." };
  if (draft.status !== "draft") return { error: "Candidature déjà envoyée." };

  const upd = buildCandidateUpdate(partial, draft.raw);
  if (Object.keys(upd).length > 0) {
    const { error } = await admin.from("candidates").update(upd).eq("id", draft.candidate_id);
    if (error) return { error: error.message };
  }
  if ("motivation" in partial) {
    await admin.from("applications").update({ motivation: (partial.motivation as string) || null }).eq("id", applicationId);
  }
  return { ok: true };
}

export async function finalizeApplication(applicationId: string, partial: Flat): Promise<{ ok?: true; error?: string }> {
  const saved = await saveApplicationStep(applicationId, partial);
  if (saved.error) return saved;
  const user = await sessionUser();
  if (!user) return { error: "not_authenticated" };
  const admin = createAdminClient();
  const draft = await ownedDraft(admin, applicationId, user.id);
  if (!draft) return { error: "Candidature introuvable." };
  if (draft.status !== "draft") return { error: "Candidature déjà envoyée." };

  const { error } = await admin.from("applications").update({ status: "new" }).eq("id", applicationId);
  if (error) return { error: error.message };

  // Recalcule le score de matching (le "premier tri" : âge + localisation + langues).
  const { data: cand } = await admin.from("candidates").select("*").eq("id", draft.candidate_id).single();
  if (cand) {
    const c = cand as Record<string, unknown>;
    try {
      const sc = computeCandidateScore({
        city: (c.city as string) ?? null,
        birth_date: (c.birth_date as string) ?? null,
        langs: (c.langs as Record<string, unknown>) ?? null,
        applied_at: (c.applied_at as string) ?? (c.created_at as string) ?? null,
        distance_km: (c.distance_km as number) ?? null,
      } as CandidateForScoring);
      await admin.from("candidates").update({
        match_score: sc.score,
        match_breakdown: sc.breakdown,
        match_score_computed_at: new Date().toISOString(),
      }).eq("id", draft.candidate_id);
    } catch { /* best-effort */ }
    try {
      if (c.email) {
        await sendApplicationAcknowledgement({
          to: c.email as string,
          fullName: (c.full_name as string) ?? "",
          candidateId: draft.candidate_id,
        });
      }
    } catch { /* best-effort */ }
  }
  revalidatePath("/rh/candidates");
  return { ok: true };
}

// Upload CV pendant l'assistant (immédiat à la sélection du fichier).
export async function uploadWizardCv(applicationId: string, formData: FormData): Promise<{ ok?: true; error?: string }> {
  const user = await sessionUser();
  if (!user) return { error: "not_authenticated" };
  const admin = createAdminClient();
  const draft = await ownedDraft(admin, applicationId, user.id);
  if (!draft) return { error: "Candidature introuvable." };

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) return { error: "Aucun fichier." };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop lourd (max 5 Mo)." };

  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
  const path = `${draft.candidate_id}/${Date.now()}-cv.${ext}`;
  const bucket = "candidate-cvs";
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (upErr) {
    // fallback bucket historique
    const { error: e2 } = await admin.storage.from("documents").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: true });
    if (e2) return { error: e2.message };
  }
  await admin.from("candidates").update({ cv_url: `${bucket}://${path}` }).eq("id", draft.candidate_id);
  try {
    await admin.from("documents").insert({
      application_id: applicationId,
      candidate_id: draft.candidate_id,
      kind: "cv",
      catalog_slug: "cv",
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
  } catch { /* documents schema variations : best-effort */ }
  return { ok: true };
}
