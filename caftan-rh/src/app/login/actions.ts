"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHome } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) return { error: "Email et mot de passe requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: { user } } = await supabase.auth.getUser();
  let dest = next || "/";
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    dest = next || (await resolveHome(supabase, user.id, profile?.role ?? "candidate"));
  }

  revalidatePath("/", "layout");
  redirect(dest);
}

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password || password.length < 8) {
    return { error: "Email + mot de passe (8 caractères min) requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Karim 2026-05-29 : envoie un mail de reset password.
 *
 * IMPORTANT : on n utilise PAS supabase.auth.resetPasswordForEmail() car le
 * SMTP partage Supabase est rate-limite a ~3-4 mails/heure.
 * A la place : supabase.auth.admin.generateLink() recupere le magic link
 * directement (Supabase le genere sans l envoyer), puis on l envoie via
 * EmailJS depuis hr@caftanfactory.com (pas de rate limit, transport propre).
 */
export async function requestPasswordResetAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !/.+@.+\..+/.test(email)) {
    return { error: "Email invalide." };
  }

  // Karim 2026-06-01 : utilise getPublicBaseUrl (TUNNEL_URL.txt > env) pour
  // que le reset password fonctionne aussi depuis smartphone via tunnel.
  const { getPublicBaseUrl } = await import("@/lib/public-base-url");
  const origin = getPublicBaseUrl() || process.env.VERCEL_URL || "http://localhost:3000";
  const redirectTo = `${origin.startsWith("http") ? "" : "https://"}${origin}/login/reset-password`;

  // Genere le magic link via Supabase Admin (n envoie PAS de mail SMTP)
  const supabaseAdmin = await import("@supabase/supabase-js").then((m) =>
    m.createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    ),
  );

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (linkErr) {
    // Pour des raisons de securite, on ne revele pas si l email existe ou non
    if (linkErr.message?.includes("not found") || linkErr.message?.includes("User not found")) {
      return { ok: true };
    }
    return { error: linkErr.message };
  }

  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) return { error: "Impossible de générer le lien." };

  // Envoie via le pipeline mail unifie (Gmail SMTP -> Resend -> EmailJS).
  const { sendAppMail } = await import("@/lib/app-mail");
  const body = `Bonjour,\n\nTu as demandé à réinitialiser ton mot de passe CaftanRH.\n\n` +
    `Clique sur le lien sécurisé ci-dessous pour définir un nouveau mot de passe :\n\n` +
    `👉 ${actionLink}\n\n` +
    `Ce lien expire dans 1 heure. Si tu n'as rien demandé, ignore simplement ce mail.\n\n` +
    `L'équipe CaftanRH`;
  const r = await sendAppMail({
    to: email,
    toName: email,
    subject: "Réinitialisation de ton mot de passe CaftanRH",
    body,
    source: "password_reset",
  });
  if (!r.ok) return { error: r.error ?? "Échec de l'envoi du mail." };
  return { ok: true };
}

/**
 * Karim 2026-05-29 : finalise le reset en definissant le nouveau mot de
 * passe (l utilisateur doit etre authentifie via le magic link recu par mail).
 */
export async function updatePasswordAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Mot de passe min 8 caracteres." };
  if (password !== confirm) return { error: "Les mots de passe ne correspondent pas." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expiree, refais la demande de reset." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}
