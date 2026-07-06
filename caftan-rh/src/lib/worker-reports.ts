// Karim 2026-07-06 : « Signaler à la direction » — helpers server-only.
//
// Canal INBOUND permanent du travailleur -> direction (worker_reports), plus la
// gestion du token DURABLE par employé (employees.report_token) qui alimente la
// page publique /signaler/[token]. Le token N'EXPIRE PAS : il accompagne le
// travailleur pendant tout son contrat.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateToken } from "@/lib/pre-interview";
import { getOutboundBaseUrl } from "@/lib/public-base-url";

export type WorkerReportCategory = "remarque" | "anomalie" | "info" | "autre";

export interface WorkerReportRow {
  id: string;
  employee_id: string;
  category: string | null;
  message: string;
  status: "new" | "read" | "handled";
  created_at: string;
}

/**
 * Retourne le token durable de l'employé, en le générant (et le persistant) s'il
 * n'existe pas encore. Le token n'expire jamais.
 *
 * Ré-entrant : deux appels concurrents retombent sur le même token grâce à la
 * relecture après tentative d'écriture (contrainte unique sur report_token).
 */
export async function ensureReportToken(
  admin: SupabaseClient,
  employeeId: string,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("employees")
    .select("report_token")
    .eq("id", employeeId)
    .maybeSingle();
  const current = (existing as { report_token: string | null } | null)?.report_token;
  if (current && current.trim().length > 0) return current;

  const token = generateToken();
  const { error } = await admin
    .from("employees")
    .update({ report_token: token })
    .eq("id", employeeId);
  if (error) {
    // Course possible : relire (un autre process a peut-être posé le token).
    const { data: reread } = await admin
      .from("employees")
      .select("report_token")
      .eq("id", employeeId)
      .maybeSingle();
    return (reread as { report_token: string | null } | null)?.report_token ?? null;
  }
  return token;
}

/** URL publique PERMANENTE du formulaire de signalement (alias prod stable). */
export function signalerPublicUrl(token: string): string {
  return `${getOutboundBaseUrl()}/signaler/${token}`;
}

/** Résout un employé (id, full_name) depuis son report_token durable. */
export async function resolveEmployeeByReportToken(
  admin: SupabaseClient,
  token: string,
): Promise<{ id: string; full_name: string | null } | null> {
  if (!token || token.trim().length === 0) return null;
  const { data } = await admin
    .from("employees")
    .select("id, full_name")
    .eq("report_token", token)
    .maybeSingle();
  return (data as { id: string; full_name: string | null } | null) ?? null;
}
