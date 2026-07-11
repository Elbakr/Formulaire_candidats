"use server";

// Karim 2026-07-11 (URGENT) : envoi MANUEL 1-clic d'une demande au travailleur —
// alerte que son titre de séjour est EXPIRÉ / va expirer et lui demande d'uploader
// sa NOUVELLE carte de séjour valide + (si détaché) les documents sociaux Limosa +
// A1, via le formulaire self-service /contract-info/{token} (CI + détachement).
// Indépendant du rappel échelonné : fonctionne même pour un titre expiré depuis
// longtemps. Source non `automated` -> passe le kill-switch (envoi manuel validé).

import crypto from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getOutboundBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";
import { revalidatePath } from "next/cache";

const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const NL_MONTHS = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function fmtDate(iso: string, lang: "fr" | "nl"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${(lang === "nl" ? NL_MONTHS : FR_MONTHS)[m - 1]} ${y}`;
}

export async function sendResidenceUpdateRequestAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string; to?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();

  const { data: eRaw } = await admin
    .from("employees")
    .select("id, full_name, email, preferred_language, residence_doc_type, residence_doc_expiry, posted_worker")
    .eq("id", employeeId)
    .maybeSingle();
  const e = eRaw as {
    id: string;
    full_name: string | null;
    email: string | null;
    preferred_language: string | null;
    residence_doc_type: string | null;
    residence_doc_expiry: string | null;
    posted_worker: boolean | null;
  } | null;
  if (!e) return { ok: false, error: "Travailleur introuvable." };
  if (!e.email) return { ok: false, error: "Aucun email sur la fiche du travailleur." };

  const lang: "fr" | "nl" = e.preferred_language === "nl" ? "nl" : "fr";
  const posted = e.posted_worker === true;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const expiry = e.residence_doc_expiry ? e.residence_doc_expiry.slice(0, 10) : null;
  const expired = !!expiry && expiry < today;
  const expiryTxt = expiry ? fmtDate(expiry, lang) : null;

  // Lien self-service (réutilise le token non complété, sinon en crée un).
  const BASE_URL = getOutboundBaseUrl();
  let token: string;
  const { data: existing } = await admin
    .from("contract_info_tokens")
    .select("token")
    .eq("employee_id", e.id)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && (existing as { token?: string }).token) {
    token = (existing as { token: string }).token;
    await admin.from("contract_info_tokens").update({ sent_at: new Date().toISOString() }).eq("token", token);
  } else {
    token = crypto.randomBytes(18).toString("base64url");
    const { error: tErr } = await admin
      .from("contract_info_tokens")
      .insert({ employee_id: e.id, token, sent_at: new Date().toISOString() });
    if (tErr) return { ok: false, error: `Lien : ${tErr.message}` };
  }
  const link = `${BASE_URL}/contract-info/${token}`;
  const first = (e.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  let subject: string;
  let body: string;
  if (lang === "nl") {
    const docs = [
      "  1. Je NIEUWE, GELDIGE verblijfskaart (voor- en achterkant).",
      posted ? "  2. Je detacheringsdocumenten: de Limosa-melding (L1) en het A1-attest." : "",
    ].filter(Boolean).join("\n");
    subject = "Actie vereist — werk je documenten bij om te blijven werken";
    body =
      `Beste ${first || "collega"},\n\n` +
      `${expired ? `Je verblijfstitel is VERVALLEN${expiryTxt ? ` (op ${expiryTxt})` : ""}.` : `Je verblijfstitel vervalt binnenkort${expiryTxt ? ` (op ${expiryTxt})` : ""}.`} ` +
      `Om in regel te kunnen BLIJVEN WERKEN, bezorg ons zo snel mogelijk:\n\n${docs}\n\n` +
      `👉 Laad alles hier op (zonder account of wachtwoord):\n${link}\n\n` +
      `Zonder geldig document is verder werken niet mogelijk. Vragen? Antwoord gewoon op deze mail.\n\n` +
      `Met vriendelijke groet,\nCaftan Factory Group — Human Resources`;
  } else {
    const docs = [
      "  1. Ta NOUVELLE carte de séjour EN COURS DE VALIDITÉ (recto/verso).",
      posted ? "  2. Tes documents de détachement : la déclaration Limosa (L1) et le certificat A1." : "",
    ].filter(Boolean).join("\n");
    subject = "Action requise — mets à jour tes documents pour continuer à travailler";
    body =
      `Bonjour ${first || ""},\n\n`.replace("  ", " ") +
      `${expired ? `Ton titre de séjour est EXPIRÉ${expiryTxt ? ` (depuis le ${expiryTxt})` : ""}.` : `Ton titre de séjour va bientôt expirer${expiryTxt ? ` (le ${expiryTxt})` : ""}.`} ` +
      `Pour pouvoir CONTINUER À TRAVAILLER en règle, merci de nous transmettre au plus vite :\n\n${docs}\n\n` +
      `👉 Dépose tout ici (sans compte ni mot de passe) :\n${link}\n\n` +
      `Sans document valide, la poursuite du travail n'est pas possible. Une question ? Réponds simplement à ce mail.\n\n` +
      `Bien à toi,\nCaftan Factory Group — Ressources Humaines`;
  }

  const res = await sendAppMail({
    to: e.email,
    toName: e.full_name ?? undefined,
    subject,
    body,
    source: "residence_update_request", // MANUEL (non `automated`) -> jamais bloqué
    employeeId: e.id,
  });
  if (res && (res as { ok?: boolean }).ok === false) {
    return { ok: false, error: (res as { error?: string }).error ?? "Échec de l'envoi." };
  }

  await admin
    .from("employees")
    .update({ residence_doc_reminder_at: new Date().toISOString() })
    .eq("id", e.id);
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, to: e.email };
}
