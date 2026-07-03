"use server";

// Karim 2026-07-03 : lien de PRÉ-EMBAUCHE pour un candidat pré-validé (hors
// formulaire de candidature). Crée une fiche candidat + un token dynamique vers
// /contract-info/{token} où le candidat s'auto-enregistre (étudiant/non-étudiant
// + infos secrétariat social). Envoi du lien MANUEL (jamais bloqué par le kill-switch).

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getOutboundBaseUrl } from "@/lib/public-base-url";
import { hireCandidateAction, type HireResult } from "./[id]/hire-actions";

export async function createPrevalidatedCandidateAction(
  input: { fullName?: string; email?: string },
): Promise<{ ok: boolean; error?: string; candidateId?: string; link?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const fullName = (input.fullName ?? "").trim() || "Candidat pré-validé";
  const email = (input.email ?? "").trim() || null;

  const { data: candRow, error: cErr } = await admin
    .from("candidates")
    .insert({ full_name: fullName, email, source: "manuel", prevalidated: true })
    .select("id")
    .single();
  if (cErr || !candRow) return { ok: false, error: cErr?.message ?? "Création candidat échouée" };
  const candidateId = (candRow as { id: string }).id;

  const token = crypto.randomBytes(18).toString("base64url");
  const { error: tErr } = await admin
    .from("contract_info_tokens")
    .insert({ candidate_id: candidateId, token, sent_at: null });
  if (tErr) return { ok: false, error: `Token: ${tErr.message}` };

  const link = `${getOutboundBaseUrl()}/contract-info/${token}`;
  return { ok: true, candidateId, link };
}

/**
 * Karim 2026-07-03 : EMBAUCHE 1-CLIC d'un candidat PRÉ-VALIDÉ (sans candidature).
 * Approche AUTONOME (ne modifie pas hireCandidateAction) : on crée une candidature-
 * relais puis on RÉUTILISE tel quel le flux d'embauche éprouvé (fiche employé, reprise
 * carte d'identité + indisponibilités, site, contrat, Dimona, compte auth). On patche
 * ensuite les champs secrétariat social que le trigger/insert ne copie pas.
 */
export async function hirePrevalidatedCandidateAction(
  candidateId: string,
  formData: FormData,
): Promise<HireResult> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: candRaw } = await admin.from("candidates").select("*").eq("id", candidateId).maybeSingle();
  const cand = candRaw as Record<string, unknown> | null;
  if (!cand) return { error: "Candidat introuvable.", steps: [] };
  if (cand.prevalidated !== true) return { error: "Ce candidat n'est pas un pré-validé.", steps: [] };

  // Candidature-relais (réutilisée si déjà présente) pour rebrancher le flux existant.
  let applicationId: string;
  const { data: existingApp } = await admin
    .from("applications").select("id").eq("candidate_id", candidateId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingApp) {
    applicationId = (existingApp as { id: string }).id;
  } else {
    const { data: app, error: appErr } = await admin
      .from("applications").insert({ candidate_id: candidateId, job_id: null, status: "new" }).select("id").single();
    if (appErr || !app) return { error: `Création candidature-relais : ${appErr?.message ?? "échec"}`, steps: [] };
    applicationId = (app as { id: string }).id;
  }

  // Flux d'embauche COMPLET, réutilisé sans modification.
  const result = await hireCandidateAction(applicationId, formData);
  if (result.error || !result.employeeId) return result;

  // Patch des champs secrétariat social non copiés par le trigger/insert (coalesce :
  // on n'écrase jamais avec du vide).
  const keys = ["nrn", "iban", "bic", "bank_holder", "birth_date", "birth_place", "nationality",
    "address", "postal_code", "city", "education_level", "marital_status", "dependent_children",
    "transport_type", "transport_frequency", "transport_price"];
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    const v = cand[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") patch[k] = v;
  }
  if (Object.keys(patch).length > 0) {
    await admin.from("employees").update(patch).eq("id", result.employeeId);
    result.steps.push({ label: "Infos secrétariat social reprises du dossier candidat", status: "ok" });
  }

  // Consomme le token de pré-embauche.
  await admin.from("contract_info_tokens").update({ completed_at: new Date().toISOString() })
    .eq("candidate_id", candidateId).is("completed_at", null);

  revalidatePath(`/rh/candidates/prevalidated/${candidateId}`);
  revalidatePath(`/planning/employees/${result.employeeId}`);
  return result;
}

export async function sendPrevalidatedLinkAction(
  input: { candidateId: string; email: string },
): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: "Email manquant" };

  const { data: tokRow } = await admin
    .from("contract_info_tokens")
    .select("token")
    .eq("candidate_id", input.candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = (tokRow as { token?: string } | null)?.token;
  if (!token) return { ok: false, error: "Lien introuvable pour ce candidat" };

  await admin.from("candidates").update({ email }).eq("id", input.candidateId);
  await admin.from("contract_info_tokens").update({ sent_at: new Date().toISOString() }).eq("token", token);

  const link = `${getOutboundBaseUrl()}/contract-info/${token}`;
  const { sendAppMail } = await import("@/lib/app-mail");
  const body = `Bonjour,

Bienvenue chez Caftan Factory ! Pour préparer ton embauche, merci de renseigner tes informations via ce lien sécurisé (sans mot de passe ni compte, à ton rythme) :

${link}

Tu pourras y indiquer si tu es étudiant(e) ou non, et compléter tes coordonnées.

À très vite,
Caftan Factory (By AMD Megastore) — RH`;

  // Envoi MANUEL (déclenché par l'admin) : pas de flag automated → jamais bloqué.
  const result = await sendAppMail({
    to: email,
    subject: "Bienvenue chez Caftan Factory — complète ton dossier d'embauche",
    body,
    source: "prevalidated_link",
    candidateId: input.candidateId,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Envoi mail échoué" };
  return { ok: true, sentTo: email };
}
