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

  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { error: "EmailJS non configuré" };

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

  const params = {
    to_email: emp.email, email: emp.email, user_email: emp.email, candidate_email: emp.email,
    to: emp.email, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: `CaftanRH - Compléter ton dossier (${missing.length} infos manquantes)`,
    message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    info_link: link,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  if (!res.ok) return { error: `EmailJS HTTP ${res.status}` };

  // Karim 2026-05-31 : archive le mail dans outbound_mails
  try {
    const { logOutboundMail } = await import("@/lib/outbound-mail-log");
    await logOutboundMail({
      recipient_email: emp.email,
      recipient_name: emp.full_name,
      subject: `CaftanRH - Compléter ton dossier (${missing.length} infos manquantes)`,
      body,
      source: "info_request",
      source_ref: emp.id,
      employee_id: emp.id,
      attachments: [{ name: "Lien dossier (token)", url: link }],
    });
  } catch {}

  return { ok: true, sent_to: emp.email };
}
