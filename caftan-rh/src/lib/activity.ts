// Server-only helpers (uses the service-role Supabase client).
// Client code must import constants/types from "@/lib/activity-shared" instead.

import { createAdminClient } from "@/lib/supabase/server";
import type { ActivityKind, ActivityTargetType } from "@/lib/activity-shared";

// Re-export shared constants/types for ergonomic server imports.
export {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KIND_GROUPS,
} from "@/lib/activity-shared";
export type { ActivityKind, ActivityTargetType, ActivityRow } from "@/lib/activity-shared";

/**
 * Insert an activity_log row using the service-role client (bypasses RLS).
 *
 * Use this for activity events that triggers can't observe — e.g.
 * client-side EmailJS sends, server-side webhooks running outside
 * an authenticated session, or batch operations where you've set
 * `caftan.skip_audit = on` and want to log a single rolled-up event.
 */
export async function logActivity(opts: {
  kind: ActivityKind;
  targetType?: ActivityTargetType;
  targetId?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
  actorId?: string | null;
  actorLabel?: string | null;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("activity_log").insert({
      kind: opts.kind,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      description: opts.description ?? null,
      data: opts.data ?? null,
      actor_id: opts.actorId ?? null,
      actor_label: opts.actorLabel ?? null,
    });
    if (error) {
      console.warn("[activity] insert failed:", error.message);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  } catch (e) {
    console.warn("[activity] unexpected error:", (e as Error).message);
    return { ok: false as const, error: (e as Error).message };
  }
}
