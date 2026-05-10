"use server";

// Génère une URL signée (5 min) pour lire une vidéo de pré-entretien.
// Réservé aux rôles RH/manager/admin. Pas d'URL publique directe : on régénère
// systématiquement une signed URL à courte durée pour limiter la fuite.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { PRE_INTERVIEW_VIDEO_BUCKET } from "@/lib/pre-interview-types";

const SIGNED_URL_TTL_SEC = 60 * 5; // 5 minutes

export async function getPreInterviewVideoSignedUrlAction(input: {
  storagePath: string;
  /** Si true, force un Content-Disposition d'attachement pour téléchargement. */
  download?: boolean;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!input.storagePath || typeof input.storagePath !== "string") {
    return { ok: false, error: "Storage path manquant." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PRE_INTERVIEW_VIDEO_BUCKET)
    .createSignedUrl(input.storagePath, SIGNED_URL_TTL_SEC, {
      download: input.download ? "video.webm" : undefined,
    });
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Échec génération signed URL." };
  }
  return { ok: true, url: data.signedUrl };
}
