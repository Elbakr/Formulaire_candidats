"use server";

// Karim 2026-06-04 : merge de doublons candidates.
// Strategie : keeper = candidate avec le plus de donnees (champs non-null)
// + applied_at le plus recent. On transfere TOUTES les FK des duplicates
// vers keeper.id, puis on DELETE les duplicates. Tout en transaction
// implicite (Supabase JS - donc en serie best effort).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type FkTransfer = {
  table: string;
  column: string;
  // si true : peut conflict avec un row existant - skip si conflit (set null par exemple)
  // sinon : update inconditionnel
  nullable?: boolean;
};

// Toutes les FK qui pointent sur candidates(id). Ordre : on transfere d abord
// les FK cascade (sinon DELETE candidates supprime les enfants), puis les set null.
const FK_TABLES: FkTransfer[] = [
  // CASCADE (perdrait les enfants si on delete sans transferer)
  { table: "applications", column: "candidate_id" },
  { table: "documents", column: "candidate_id" },
  { table: "document_upload_tokens", column: "candidate_id" },
  { table: "screening_responses", column: "candidate_id" },
  // SET NULL (transfert pour preserver le lien metier)
  { table: "shifts", column: "candidate_id", nullable: true },
  { table: "employees", column: "candidate_id", nullable: true },
  { table: "ai_assistant_conversations", column: "candidate_id", nullable: true },
  { table: "outbound_mails", column: "candidate_id", nullable: true },
  { table: "document_audit_log", column: "candidate_id", nullable: true },
];

export async function mergeCandidatesAction(args: {
  keeperId: string;
  duplicateIds: string[];
}): Promise<{ ok: boolean; error?: string; transferred?: Record<string, number>; deleted?: number }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.keeperId || args.duplicateIds.length === 0) {
    return { ok: false, error: "keeper et duplicates requis" };
  }
  if (args.duplicateIds.includes(args.keeperId)) {
    return { ok: false, error: "keeper ne peut pas etre dans duplicates" };
  }

  const admin = createAdminClient();

  // Verifie que tous les ids existent
  const allIds = [args.keeperId, ...args.duplicateIds];
  const { data: rows } = await admin.from("candidates").select("id, email, full_name").in("id", allIds);
  if (!rows || rows.length !== allIds.length) {
    return { ok: false, error: "certains candidates introuvables" };
  }

  const transferred: Record<string, number> = {};

  // 1. Transfere les FK
  for (const fk of FK_TABLES) {
    try {
      const { error, count } = await admin
        .from(fk.table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ [fk.column]: args.keeperId } as any, { count: "exact" })
        .in(fk.column, args.duplicateIds);
      if (error) {
        console.warn(`[merge] FK ${fk.table}.${fk.column}:`, error.message);
        // continue - on ne bloque pas tout sur une table optionnelle
        transferred[fk.table] = -1;
        continue;
      }
      transferred[fk.table] = count ?? 0;
    } catch (e) {
      console.warn(`[merge] exception ${fk.table}:`, (e as Error).message);
      transferred[fk.table] = -1;
    }
  }

  // 2. Supprime les duplicates
  const { error: delErr, count } = await admin
    .from("candidates")
    .delete({ count: "exact" })
    .in("id", args.duplicateIds);
  if (delErr) {
    return {
      ok: false,
      error: `FK transferes mais DELETE candidates a echoue : ${delErr.message}`,
      transferred,
    };
  }

  // 3. Log audit
  try {
    const kept = rows.find((r) => r.id === args.keeperId);
    const removed = rows.filter((r) => args.duplicateIds.includes(r.id));
    await admin.from("activity_log").insert({
      profile_id: profile.id,
      action: "candidates_merged",
      target_type: "candidate",
      target_id: args.keeperId,
      body: `Fusion de ${removed.length} doublon(s) vers ${kept?.full_name ?? "?"} (${kept?.email ?? "?"}). ` +
        `IDs supprimes : ${args.duplicateIds.join(", ")}. ` +
        `Transferts FK : ${Object.entries(transferred).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    });
  } catch {/* */}

  revalidatePath("/admin/candidates/duplicates");
  revalidatePath("/rh/candidates");

  return { ok: true, transferred, deleted: count ?? 0 };
}
