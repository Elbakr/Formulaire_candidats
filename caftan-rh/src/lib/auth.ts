import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { AppRole } from "@/types/database.types";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireProfile() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  return { user, profile };
}

export async function requireRole(allowed: AppRole[]) {
  const { user, profile } = await requireProfile();
  if (!allowed.includes(profile.role)) {
    redirect(roleHome(profile.role));
  }
  return { user, profile };
}

export function roleHome(role: AppRole | string) {
  // Patron, RH et Manager : la page la plus utile au quotidien = le planning de la semaine.
  // Le candidat / employé : son propre espace.
  switch (role) {
    case "admin":
    case "rh":
    case "manager":
      return "/planning/calendar";
    case "employee":
      return "/me";
    default:
      return "/me";
  }
}

// Karim 2026-06-13 (Phase 1 cycle de vie) : resout l'accueil REEL d'un compte.
// Subtilite : aujourd'hui un employe embauche a encore role='candidate' (le role
// 'employee' arrive en Phase 2). On distingue donc le vrai candidat (espace
// /candidat) de l'employe (espace /me) par la PRESENCE d'une ligne `employees`.
// Appele uniquement aux points de redirection (login, callback, landing) — pas
// a chaque requete — donc le coût de la requête est négligeable.
export async function resolveHome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  role: AppRole | string,
): Promise<string> {
  // Karim 2026-07-08 : le RESPONSABLE RH atterrit sur le HUB RH (accueil clair,
  // mobile, sans confusion : recrutement, planning, évaluations, congés…).
  if (role === "rh") return "/rh/hub";
  if (role === "admin" || role === "manager") return "/planning/calendar";
  if (role === "employee") return "/me";
  // role 'candidate' : employe (legacy) si une fiche employee existe, sinon candidat.
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return emp ? "/me" : "/candidat";
}
