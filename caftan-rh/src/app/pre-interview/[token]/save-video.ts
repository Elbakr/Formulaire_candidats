"use server";

// Server action publique (sans auth, token-based) : enregistre une réponse vidéo.
// L'upload du blob est fait côté client directement vers Supabase Storage
// (bucket privé "pre-interview-videos", policy INSERT permissive : seul le
// token candidat — passé dans le path — verrouille l'accès en pratique).
//
// Cette action n'écrit QUE la ligne `pre_interview_responses` (upsert sur
// `(pre_interview_id, question_id)`) avec le `video_storage_path`. Elle ne
// fixe PAS `video_purge_after` (la purge est armée à la décision RH).

import { createAdminClient } from "@/lib/supabase/server";
import { loadPreInterviewByToken } from "@/lib/pre-interview";
import { PRE_INTERVIEW_VIDEO_BUCKET } from "@/lib/pre-interview-types";

type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveVideoResponseAction(input: {
  token: string;
  questionId: string;
  storagePath: string;
  durationSec: number;
}): Promise<SaveResult> {
  if (!input.token || !input.questionId || !input.storagePath) {
    return { ok: false, error: "Données manquantes." };
  }

  const pi = await loadPreInterviewByToken(input.token);
  if (!pi) return { ok: false, error: "Lien invalide." };
  if (pi.status === "completed") {
    return { ok: false, error: "Pré-entretien déjà soumis." };
  }
  if (pi.status === "discarded") {
    return { ok: false, error: "Pré-entretien annulé." };
  }
  if (pi.expires_at && new Date(pi.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Le délai de réponse est expiré." };
  }

  const admin = createAdminClient();

  // Vérifie que la question existe ET qu'elle est de type 'video'.
  const { data: q } = await admin
    .from("pre_interview_questions")
    .select("id, kind, video_max_seconds")
    .eq("id", input.questionId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Question inconnue." };
  const qq = q as { id: string; kind: string; video_max_seconds: number | null };
  if (qq.kind !== "video") {
    return { ok: false, error: "Cette question n'est pas une question vidéo." };
  }

  // Sécurité : le path doit commencer par "{token}/" pour éviter qu'un client
  // ne référence un fichier appartenant à un autre candidat.
  const expectedPrefix = `${input.token}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    return { ok: false, error: "Storage path invalide." };
  }

  // Clamp durationSec dans une fenêtre raisonnable.
  const maxAllowed = (qq.video_max_seconds ?? 90) + 5; // tolérance 5 sec
  const duration = Math.max(0, Math.min(maxAllowed, Math.round(input.durationSec || 0)));

  // Vérifie que le fichier existe vraiment dans le bucket
  // (évite un upsert "fantôme" si l'upload a foiré avant cet appel).
  const { data: head } = await admin.storage
    .from(PRE_INTERVIEW_VIDEO_BUCKET)
    .list(input.token, { search: input.storagePath.slice(expectedPrefix.length) });
  if (!head || head.length === 0) {
    return { ok: false, error: "Fichier vidéo introuvable côté Storage." };
  }

  const { error: upErr } = await admin
    .from("pre_interview_responses")
    .upsert(
      {
        pre_interview_id: pi.id,
        question_id: input.questionId,
        video_storage_path: input.storagePath,
        video_duration_sec: duration,
        video_purge_after: null, // fixé à la décision RH
        // On préserve d'éventuels champs écrits (texte de fallback) côté DB :
        // l'upsert ne touche que les colonnes mentionnées.
        answered_at: new Date().toISOString(),
      },
      { onConflict: "pre_interview_id,question_id" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  // Mark started_at on first response
  if (!pi.started_at) {
    await admin
      .from("pre_interviews")
      .update({ started_at: new Date().toISOString(), status: "started" })
      .eq("id", pi.id);
  }

  return { ok: true };
}
