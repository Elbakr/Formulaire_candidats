"use server";

// Server actions pour /me/my-clients (vendeuse) et /admin/vip-clients (RH).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export type VipKind = "visit" | "fitting" | "purchase" | "return";

// ─── Création cliente ──────────────────────────────────────────────────────

export async function createVipClientAction(formData: FormData) {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const dress_size = String(formData.get("dress_size") ?? "").trim() || null;
  const color_prefs = String(formData.get("color_prefs") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "fr").trim() || "fr";
  const birth_date_raw = String(formData.get("birth_date") ?? "").trim();
  const birth_date = birth_date_raw ? birth_date_raw : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const consent = formData.get("consent") === "on" || formData.get("consent") === "true";
  const preferred_site_id = String(formData.get("preferred_site_id") ?? "").trim() || null;
  // Si l'utilisateur est admin/RH, il peut spécifier un autre vendeur que lui.
  const requested_seller_id = String(formData.get("preferred_seller_id") ?? "").trim() || null;

  if (!full_name) return { error: "Nom complet requis." };
  if (!consent) {
    return {
      error:
        "Le consentement RGPD de la cliente est obligatoire (case à cocher). Sans accord explicite, on ne peut pas enregistrer ses données.",
    };
  }

  // Récupère l'employee_id du profil courant (sauf si admin et seller choisi).
  let preferred_seller_id: string | null = null;
  const { data: empSelf } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const myEmployeeId = (empSelf as { id: string } | null)?.id ?? null;

  if (requested_seller_id) {
    // Quand on est admin/RH on autorise à choisir, sinon on force = soi-même.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile as { role: string } | null)?.role;
    if (role === "admin" || role === "rh") {
      preferred_seller_id = requested_seller_id;
    } else {
      preferred_seller_id = myEmployeeId;
    }
  } else {
    preferred_seller_id = myEmployeeId;
  }

  const { error } = await supabase.from("vip_clients").insert({
    full_name,
    phone,
    email,
    dress_size,
    color_prefs,
    notes,
    language,
    birth_date,
    preferred_seller_id,
    preferred_site_id,
    consent_recorded_at: new Date().toISOString(),
    is_active: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/me/my-clients");
  revalidatePath("/admin/vip-clients");
  return { ok: true };
}

// ─── Update cliente ───────────────────────────────────────────────────────

export async function updateVipClientAction(id: string, formData: FormData) {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const dress_size = String(formData.get("dress_size") ?? "").trim() || null;
  const color_prefs = String(formData.get("color_prefs") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "fr").trim() || "fr";
  const birth_date_raw = String(formData.get("birth_date") ?? "").trim();
  const birth_date = birth_date_raw ? birth_date_raw : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const preferred_site_id = String(formData.get("preferred_site_id") ?? "").trim() || null;

  if (!full_name) return { error: "Nom complet requis." };

  const { error } = await supabase
    .from("vip_clients")
    .update({
      full_name,
      phone,
      email,
      dress_size,
      color_prefs,
      notes,
      language,
      birth_date,
      preferred_site_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  // Best-effort log pour distinguer auto-update vs admin override.
  void user;

  revalidatePath("/me/my-clients");
  revalidatePath("/admin/vip-clients");
  return { ok: true };
}

// ─── Désactivation (soft delete) ──────────────────────────────────────────

export async function deactivateVipClientAction(id: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vip_clients")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/me/my-clients");
  revalidatePath("/admin/vip-clients");
  return { ok: true };
}

// ─── Logger une visite ───────────────────────────────────────────────────

export async function logVipVisitAction(formData: FormData) {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const client_id = String(formData.get("client_id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "visit").trim() as VipKind;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const follow_up_raw = String(formData.get("follow_up_date") ?? "").trim();
  const follow_up_date = follow_up_raw ? follow_up_raw : null;
  const site_id = String(formData.get("site_id") ?? "").trim() || null;

  if (!client_id) return { error: "Cliente manquante." };
  if (!["visit", "fitting", "purchase", "return"].includes(kind)) {
    return { error: "Type de visite invalide." };
  }

  // Récupère mon employee_id pour seller_id.
  const { data: empSelf } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const seller_id = (empSelf as { id: string } | null)?.id ?? null;

  if (!seller_id) {
    return { error: "Tu dois être un employé actif pour logger une visite." };
  }

  const { error } = await supabase.from("vip_visits").insert({
    client_id,
    visited_at: new Date().toISOString(),
    kind,
    notes,
    follow_up_date,
    seller_id,
    site_id,
  });
  if (error) return { error: error.message };
  revalidatePath("/me/my-clients");
  revalidatePath("/admin/vip-clients");
  return { ok: true };
}

// ─── Transfert de cliente entre vendeurs (admin / RH) ────────────────────

export async function transferVipClientAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const id = String(formData.get("id") ?? "").trim();
  const new_seller_id = String(formData.get("new_seller_id") ?? "").trim();
  if (!id) return { error: "Cliente requise." };
  if (!new_seller_id) return { error: "Vendeuse cible requise." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vip_clients")
    .update({ preferred_seller_id: new_seller_id })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/me/my-clients");
  revalidatePath("/admin/vip-clients");
  return { ok: true };
}
