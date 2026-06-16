"use server";

// Karim 2026-06-13 : RECABLE. Envoie au travailleur un lien a TOKEN autonome
// (page publique /contract-info/{token}, URL stable Vercel) pour completer les
// champs manquants de sa fiche RH. Remplace l'ancien magic link qui exigeait un
// compte ET redirigeait vers le tunnel Cloudflare (URL changeante = lien mort).

import crypto from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/contract-readiness";
import { getOutboundBaseUrl } from "@/lib/public-base-url";

export async function sendInfoRequestMailAction(
  employeeId: string,
): Promise<{ ok?: true; error?: string; sent_to?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, email, contract_type, profile_id, full_name, nrn, birth_date, address, postal_code, city, iban, weekly_hours, start_date, end_date, hourly_rate")
    .eq("id", employeeId)
    .single();
  if (!emp) return { error: "Employé introuvable" };
  if (!emp.email) return { error: "Email employé manquant" };

  // Karim 2026-05-30 : filtre les champs adminOnly - on ne demande PAS
  // au candidat ce qui est decidé par admin/RH (end_date, weekly_hours, etc.).
  const missingAll = getMissingFields(emp as unknown as Record<string, unknown>, emp.contract_type);
  const missing = missingAll.filter((f) => !f.adminOnly);
  if (missing.length === 0) {
    if (missingAll.length > 0) {
      return { error: `Les champs manquants sont du ressort admin/RH (${missingAll.map(m => m.label).join(", ")}). À compléter directement sur la fiche.` };
    }
    return { error: "Aucun champ manquant - inutile d envoyer ce mail" };
  }

  // Lien a TOKEN autonome, sur une URL joignable par un externe (jamais
  // localhost, jamais le tunnel jetable). getOutboundBaseUrl garantit l'alias
  // stable meme si le mail part du PC en dev.
  const BASE_URL = getOutboundBaseUrl();
  let token: string;
  const { data: existing } = await admin
    .from("contract_info_tokens")
    .select("token")
    .eq("employee_id", emp.id)
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
      .insert({ employee_id: emp.id, token, sent_at: new Date().toISOString() });
    if (tErr) return { error: `Token: ${tErr.message}` };
  }
  const link = `${BASE_URL}/contract-info/${token}`;

  const { sendAppMail } = await import("@/lib/app-mail");

  const firstName = emp.full_name?.split(" ")[0] ?? "";
  const missingList = missing.map((m, i) => `  ${i + 1}. ${m.label}`).join("\n");

  const body = `Bonjour ${firstName},

Pour finaliser ton dossier RH et préparer ton contrat de travail, merci de compléter ou vérifier les informations suivantes :

${missingList}

👉 Clique ici pour les renseigner (1 minute, sans mot de passe ni compte) :
${link}

Dès que c'est fait, ton dossier avance et ton contrat pourra être préparé.
Si tu as une question, réponds simplement à ce mail.

À bientôt,
Caftan Factory (By AMD Megastore) — RH
`;

  const subject = `CaftanRH - Compléter ton dossier (${missing.length} infos manquantes)`;
  const result = await sendAppMail({
    to: emp.email,
    toName: emp.full_name ?? undefined,
    subject,
    body,
    source: "info_request",
    employeeId: emp.id,
  });
  if (!result.ok) return { error: result.error ?? "Envoi mail échoué" };

  return { ok: true, sent_to: emp.email };
}
