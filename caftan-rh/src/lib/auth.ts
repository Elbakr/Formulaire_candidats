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
  switch (role) {
    case "admin":
      return "/admin";
    case "rh":
      return "/rh";
    case "manager":
      return "/manager";
    default:
      return "/me";
  }
}
