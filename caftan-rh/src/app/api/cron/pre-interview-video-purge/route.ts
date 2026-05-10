// GET /api/cron/pre-interview-video-purge — quotidien (vercel cron, 02h Europe/Brussels).
//
// Purge RGPD des vidéos de pré-entretien : pour chaque pre_interview_responses
// dont video_storage_path est non null ET video_purge_after < now(), on
// supprime le fichier dans le bucket privé `pre-interview-videos` et on remet
// `video_storage_path = NULL`. La ligne `pre_interview_responses` elle-même
// est préservée (historique des réponses pour l'archive RH).
//
// Auth : Bearer CRON_SECRET. Idempotent. Batch 200 par exécution.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { PRE_INTERVIEW_VIDEO_BUCKET } from "@/lib/pre-interview-types";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowISO = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("pre_interview_responses")
    .select("id, video_storage_path, video_purge_after")
    .lt("video_purge_after", nowISO)
    .not("video_storage_path", "is", null)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[pre-interview-video-purge] load failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    video_storage_path: string | null;
    video_purge_after: string;
  };
  const list = (rows ?? []) as Row[];

  let storageDeleted = 0;
  let storageMissing = 0;
  let dbCleared = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  const paths = list
    .map((r) => r.video_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  if (paths.length > 0) {
    const { data: removed, error: rmErr } = await admin.storage
      .from(PRE_INTERVIEW_VIDEO_BUCKET)
      .remove(paths);
    if (rmErr) {
      console.warn(
        "[pre-interview-video-purge] storage.remove warning:",
        rmErr.message,
      );
      errors.push({ id: "storage_batch", reason: rmErr.message });
    } else {
      storageDeleted = (removed ?? []).length;
      storageMissing = Math.max(0, paths.length - storageDeleted);
    }
  }

  const ids = list.map((r) => r.id);
  if (ids.length > 0) {
    const { error: upErr } = await admin
      .from("pre_interview_responses")
      .update({ video_storage_path: null })
      .in("id", ids);
    if (upErr) {
      console.error("[pre-interview-video-purge] update failed:", upErr.message);
      errors.push({ id: "db_batch", reason: upErr.message });
    } else {
      dbCleared = ids.length;
    }
  }

  await logActivity({
    kind: "pre_interview.video_purge",
    actorLabel: "pre-interview-video-purge (cron)",
    description: `Purge ${dbCleared} vidéo(s), ${storageDeleted} fichier(s) supprimés, ${storageMissing} déjà absent(s).`,
    data: {
      processed: list.length,
      storage_deleted: storageDeleted,
      storage_missing: storageMissing,
      db_cleared: dbCleared,
      errors,
    },
  });

  return NextResponse.json({
    ok: true,
    processed: list.length,
    storage_deleted: storageDeleted,
    storage_missing: storageMissing,
    db_cleared: dbCleared,
    has_more: list.length === BATCH_SIZE,
    errors,
  });
}
