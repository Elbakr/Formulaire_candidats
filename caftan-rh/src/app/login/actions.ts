"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth";

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
    dest = next || roleHome(profile?.role ?? "candidate");
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
 * Karim 2026-05-29 : envoie un mail de reset password via Supabase Auth.
 * L utilisateur recoit un lien qui le mene vers /login/reset-password ou
 * il peut definir un nouveau mot de passe.
 */
export async function requestPasswordResetAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !/.+@.+\..+/.test(email)) {
    return { error: "Email invalide." };
  }

  const supabase = await createClient();
  // Construit l URL de redirection apres clic sur le lien dans le mail
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_URL
    || "http://localhost:3000";
  const redirectTo = `${origin.startsWith("http") ? "" : "https://"}${origin}/login/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) return { error: error.message };
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
