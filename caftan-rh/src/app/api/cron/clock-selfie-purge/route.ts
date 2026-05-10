// GET /api/cron/clock-selfie-purge — quotidien (vercel cron, 03h Europe/Brussels).
//
// Purge RGPD des photos selfie de pointage > N jours (org_settings.clock_selfie_keep_days,
// défaut 30). On supprime UNIQUEMENT le fichier dans Supabase Storage et on
// remet `clock_entries.selfie_storage_path = NULL`. La row clock_entries
// elle-même est préservée pour conserver l'historique horodaté du pointage.
//
// Auth : Bearer CRON_SECRET. Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const BUCKET = "clock-selfies";
const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowISO = new Date().toISOString();

  // Charge en batch les entries dont selfie_purge_after est passé.
  const { data: rows, error } = await admin
    .from("clock_entries")
    .select("id, selfie_storage_path, selfie_purge_after")
    .lt("selfie_purge_after", nowISO)
    .not("selfie_storage_path", "is", null)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[clock-selfie-purge] load failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Row = { id: string; selfie_storage_path: string | null; selfie_purge_after: string };
  const list = (rows ?? []) as Row[];

  let storageDeleted = 0;
  let storageMissing = 0;
  let dbCleared = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  // Supprime les fichiers du bucket en batch (Supabase Storage accepte un array).
  const paths = list
    .map((r) => r.selfie_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  if (paths.length > 0) {
    const { data: removed, error: rmErr } = await admin.storage
      .from(BUCKET)
      .remove(paths);
    if (rmErr) {
      // On log mais on continue : on veut quand même clear les paths côté DB
      // pour ne pas re-tenter en boucle des fichiers fantômes.
      console.warn("[clock-selfie-purge] storage.remove warning:", rmErr.message);
      errors.push({ id: "storage_batch", reason: rmErr.message });
    } else {
      storageDeleted = (removed ?? []).length;
      storageMissing = Math.max(0, paths.length - storageDeleted);
    }
  }

  // Clear côté DB en une seule update (où id IN (...) AND selfie_purge_after < now).
  const ids = list.map((r) => r.id);
  if (ids.length > 0) {
    const { error: upErr } = await admin
      .from("clock_entries")
      .update({ selfie_storage_path: null })
      .in("id", ids);
    if (upErr) {
      console.error("[clock-selfie-purge] update failed:", upErr.message);
      errors.push({ id: "db_batch", reason: upErr.message });
    } else {
      dbCleared = ids.length;
    }
  }

  await logActivity({
    kind: "clock.selfie_purge",
    actorLabel: "clock-selfie-purge (cron)",
    description: `Purge ${dbCleared} selfie(s), ${storageDeleted} fichier(s) supprimés, ${storageMissing} déjà absents.`,
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
