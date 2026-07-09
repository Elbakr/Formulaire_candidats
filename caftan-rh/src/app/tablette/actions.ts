"use server";

// Karim 2026-07-09 (Phase 3) : résolution PUBLIQUE (sans auth) du planning par
// défaut d'un travailleur à partir de son CODE PERSONNEL, pour la tablette
// partagée du magasin. Service-role : la page /tablette n'a pas de session.
//
// Sécurité assumée : le code est une COMMODITÉ (tablette magasin), pas une auth
// forte. On limite l'énumération (petit délai + message générique) et on ne
// renvoie QUE le planning par défaut du travailleur dont on a le code (prénom +
// horaires), jamais les 2 variantes ni de données internes.

import { createAdminClient } from "@/lib/supabase/server";

export type TabletBreak = { start: string; end: string };
export type TabletShift = {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  pause?: { start: string; end: string } | null;
  breaks?: TabletBreak[];
};
export type TabletWeek = {
  week_index: number;
  week_start: string;
  week_end: string;
  shifts: TabletShift[];
  total_hours: number;
};
export type TabletPlanning = {
  first_name: string;
  variant: "A" | "B";
  weeks: TabletWeek[];
  total_hours: number;
};

type ResolveResult =
  | { ok: true; planning: TabletPlanning }
  | { ok: false; kind: "invalid" | "empty"; message: string };

function firstNameOf(fullName: string | null): string {
  const n = (fullName ?? "").trim();
  if (!n) return "Bonjour";
  return n.split(/\s+/)[0];
}

/** Petit délai anti-énumération (temps de réponse ~constant, code trouvé ou non). */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function resolvePlanningByCodeAction(
  rawCode: string,
): Promise<ResolveResult> {
  await delay(350);

  const code = (rawCode ?? "").replace(/\D/g, "").trim();
  const generic = {
    ok: false as const,
    kind: "invalid" as const,
    message: "Code non reconnu. Vérifie ton code et réessaie.",
  };
  if (code.length < 4 || code.length > 8) return generic;

  const admin = createAdminClient();
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name")
    .eq("planning_access_code", code)
    .maybeSingle();
  const emp = empRaw as { id: string; full_name: string | null } | null;
  if (!emp) return generic;

  const { data: propRaw } = await admin
    .from("planning_proposals")
    .select("variant_a, variant_b, selected_variant")
    .eq("employee_id", emp.id)
    .maybeSingle();
  const prop = propRaw as
    | { variant_a: unknown; variant_b: unknown; selected_variant: "A" | "B" | null }
    | null;

  if (!prop) {
    return {
      ok: false,
      kind: "empty",
      message: "Aucun planning disponible pour l'instant.",
    };
  }

  // Défaut 'A' si rien n'a été coché (aligné sur la Phase 2).
  const variant: "A" | "B" = prop.selected_variant === "B" ? "B" : "A";
  const chosen = (variant === "B" ? prop.variant_b : prop.variant_a) as
    | { weeks?: TabletWeek[]; total_hours?: number }
    | null;

  const weeks = (chosen?.weeks ?? []) as TabletWeek[];
  const totalHours =
    typeof chosen?.total_hours === "number"
      ? chosen.total_hours
      : weeks.reduce((s, w) => s + (w.total_hours ?? 0), 0);

  return {
    ok: true,
    planning: {
      first_name: firstNameOf(emp.full_name),
      variant,
      weeks,
      total_hours: totalHours,
    },
  };
}
