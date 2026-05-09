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
    default:
      return "/me";
  }
}
