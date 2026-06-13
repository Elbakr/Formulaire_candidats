// Karim 2026-06-13 (Phase 1 cycle de vie) : authentification CANDIDAT par lien
// magique (sans mot de passe). C'est le "point A" : un candidat doit creer un
// compte pour lire le detail d'une offre et postuler.
//
// Pattern reutilise de requestPasswordResetAction (login/actions.ts) : on NE
// passe PAS par supabase.auth.signInWithOtp (SMTP Supabase rate-limite a ~3-4
// mails/h), mais par admin.generateLink (genere le lien SANS l'envoyer) puis
// envoi via EmailJS depuis hr@caftanfactory.com (transport propre, pas de
// limite). Le clic atterrit sur /auth/callback qui echange le code -> session.

import "server-only";
import { getOutboundBaseUrl } from "@/lib/public-base-url";

function adminAuthClient() {
  return import("@supabase/supabase-js").then((m) =>
    m.createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  );
}

/**
 * Envoie un lien magique de connexion candidat. Cree le compte s'il n'existe
 * pas encore (role 'candidate' via le trigger handle_new_user). `next` = chemin
 * de destination apres connexion (ex. l'offre que le candidat voulait lire).
 */
export async function sendCandidateMagicLink(
  emailRaw: string,
  opts?: { fullName?: string; next?: string },
): Promise<{ ok?: true; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return { error: "Email invalide." };

  const admin = await adminAuthClient();

  // 1. S'assure que le compte existe (idempotent : on ignore "already exists").
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: opts?.fullName ? { full_name: opts.fullName } : {},
  });
  if (
    createErr &&
    !/already|exist|registered|duplicate/i.test(createErr.message ?? "")
  ) {
    return { error: createErr.message };
  }

  // 2. Genere le lien magique. On RECUPERE le token_hash et on construit NOTRE
  //    propre lien de confirmation (/auth/confirm) sur l'URL stable : aucune
  //    dependance au "Site URL"/allow-list du dashboard Supabase (qui faisait
  //    retomber le lien sur localhost). redirectTo ne sert qu'a satisfaire l'API.
  const base = getOutboundBaseUrl();
  const nextPath = opts?.next && opts.next.startsWith("/") ? opts.next : "/candidat";
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  });
  if (linkErr) return { error: linkErr.message };
  const hashedToken = linkData?.properties?.hashed_token;
  if (!hashedToken) return { error: "Impossible de générer le lien." };
  const actionLink =
    `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=magiclink&next=${encodeURIComponent(nextPath)}`;

  // 3. Envoi via EmailJS (depuis hr@caftanfactory.com, pas de rate limit).
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !PUBLIC_KEY) return { error: "EmailJS non configuré." };

  const first = (opts?.fullName ?? "").split(/\s+/)[0] ?? "";
  const body =
    `Bonjour ${first},\n\n` +
    `Voici ton lien de connexion à l'espace candidat Caftan Factory.\n` +
    `Clique pour accéder à ton compte (aucun mot de passe nécessaire) :\n\n` +
    `👉 ${actionLink}\n\n` +
    `Ce lien expire dans 1 heure. Si tu n'as rien demandé, ignore ce mail.\n\n` +
    `À bientôt,\nCaftan Factory (By AMD Megastore) — Recrutement`;
  const params = {
    to_email: email, email, user_email: email, candidate_email: email,
    to: email, to_name: opts?.fullName || email, name: opts?.fullName || email,
    candidate_name: opts?.fullName || email,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: "Ton lien de connexion — Caftan Factory",
    message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    login_url: actionLink,
  };
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: PUBLIC_KEY, template_params: params }),
    });
    if (!res.ok) return { error: `EmailJS HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
