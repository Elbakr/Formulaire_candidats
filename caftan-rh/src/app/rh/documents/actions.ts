"use server";

// Karim 2026-06-02 : signed URL on-demand pour la valise documents.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_BUCKETS = new Set(["payslips", "terminations", "candidate-docs", "contracts", "mail-attachments"]);

export async function getValiseDocSignedUrlAction(args: {
  bucket: string;
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!ALLOWED_BUCKETS.has(args.bucket)) return { ok: false, error: `Bucket non autorisé : ${args.bucket}` };
  if (!args.storagePath) return { ok: false, error: "Path manquant" };
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(args.bucket).createSignedUrl(args.storagePath, args.expiresInSeconds ?? 3600);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Signed URL KO" };
  return { ok: true, url: data.signedUrl };
}
