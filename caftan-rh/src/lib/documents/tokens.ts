// Cycle de vie des magic links d'upload de documents.

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export type UploadTokenRow = {
  id: string;
  token: string;
  candidate_id: string | null;
  employee_id: string | null;
  application_id: string | null;
  doc_slug: string | null;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  status: string;
  hint: string | null;
  created_at: string;
};

type CreateArgs = {
  candidateId?: string | null;
  employeeId?: string | null;
  applicationId?: string | null;
  docSlug: string;
  ttlDays?: number;
  createdBy?: string | null;
  hint?: string | null;
};

export type CreateTokenResult = {
  ok: true;
  id: string;
  token: string;
  url: string;
  expiresAt: string;
} | {
  ok: false;
  error: string;
};

/** Crée un token URL-safe (base64url, ~43 chars) lié à un dossier + un slug doc. */
export async function createUploadToken(args: CreateArgs): Promise<CreateTokenResult> {
  if (!args.candidateId && !args.employeeId && !args.applicationId) {
    return { ok: false, error: "candidateId, employeeId ou applicationId requis." };
  }
  if (!args.docSlug) return { ok: false, error: "docSlug requis." };

  const ttlDays = args.ttlDays ?? 7;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("document_upload_tokens")
    .insert({
      token,
      candidate_id: args.candidateId ?? null,
      employee_id: args.employeeId ?? null,
      application_id: args.applicationId ?? null,
      doc_slug: args.docSlug,
      expires_at: expiresAt,
      created_by: args.createdBy ?? null,
      status: "active",
      hint: args.hint ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${baseUrl.replace(/\/$/, "")}/upload/${token}`;
  return { ok: true, id: (data as { id: string }).id, token, url, expiresAt };
}

/**
 * Vérifie qu'un token est valide (status=active, non expiré, non utilisé).
 * Retourne la row complète ou null.
 */
export async function validateToken(token: string): Promise<UploadTokenRow | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("document_upload_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  const row = data as unknown as UploadTokenRow | null;
  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/** Marque un token comme `used`. */
export async function markTokenUsed(tokenId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("document_upload_tokens")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", tokenId);
}

/** Marque un token comme révoqué. */
export async function revokeToken(tokenId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("document_upload_tokens")
    .update({ status: "revoked" })
    .eq("id", tokenId);
}
