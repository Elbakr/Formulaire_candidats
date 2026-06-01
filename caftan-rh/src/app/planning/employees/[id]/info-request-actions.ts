"use server";

// Karim 2026-05-30 : envoie au candidat un mail avec magic link + liens
// self-service pour compléter les champs manquants de sa fiche RH.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getMissingFields } from "@/lib/contract-readiness";
import { getPublicBaseUrl } from "@/lib/public-base-url";

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

  // Karim 2026-05-30 : magic link auto-login redirigé vers le tunnel actif
  // (lu depuis TUNNEL_URL.txt) pour que le candidat puisse cliquer à distance.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tunnel = getPublicBaseUrl();
  const { data: link } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email: emp.email,
    options: { redirectTo: `${tunnel}/me/profile` },
  });
  const magicLink = link?.properties?.action_link;
  if (!magicLink) return { error: "Magic link KO" };

  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return { error: "EmailJS non configuré" };

  const firstName = emp.full_name?.split(" ")[0] ?? "";
  const missingList = missing.map((m, i) => `  ${i + 1}. ${m.label}`).join("\n");

  const body = `Bonjour ${firstName},

Pour finaliser ton dossier RH et générer ton contrat de travail, nous avons besoin que tu complètes ou vérifies les informations suivantes :

${missingList}

═══════ ACCÈS AUTO (1h valide) ═══════

👉 ${magicLink}

(Connexion automatique sans mot de passe - clique le lien depuis ton téléphone ou ordi)

═══════ TES LIENS DIRECTS (tunnel public) ═══════

🔗 Compléter mon profil : ${tunnel}/me/profile
🔗 Mes documents       : ${tunnel}/me/documents
🔗 Mon onboarding      : ${tunnel}/me/onboarding

═══════ APRÈS COMPLÉTION ═══════

Dès que tous les champs sont remplis, ton contrat sera automatiquement
prêt à signer. Tu recevras un second mail avec le lien de signature.

Si tu as des questions, réponds simplement à ce mail.

À bientôt,
CaftanRH
`;

  const params = {
    to_email: emp.email, email: emp.email, user_email: emp.email, candidate_email: emp.email,
    to: emp.email, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: `CaftanRH - Compléter ton dossier (${missing.length} infos manquantes)`,
    message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    magic_link: magicLink,
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
      attachments: [{ name: "Magic link auto-login (1h)", url: magicLink }],
    });
  } catch {}

  return { ok: true, sent_to: emp.email };
}
