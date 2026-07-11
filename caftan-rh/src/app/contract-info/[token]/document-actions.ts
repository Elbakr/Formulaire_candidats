"use server";

// Karim 2026-07-11 : dépôt self-service des documents de détachement (Limosa L1,
// A1) dans le formulaire de complétion du dossier. Stocke dans la valise
// (documents), remplace l'ancien du même type, puis lance le CONTRÔLE IA de
// conformité/validité.

import { createAdminClient } from "@/lib/supabase/server";
import { checkDocumentConformity } from "@/lib/document-conformity";

export type WorkerDocKind = "limosa" | "a1";

function decodeDataUrl(b64: string): Uint8Array {
  const comma = b64.indexOf(",");
  const raw = comma >= 0 ? b64.slice(comma + 1) : b64;
  return new Uint8Array(Buffer.from(raw, "base64"));
}

const LABEL: Record<WorkerDocKind, string> = { limosa: "Limosa (L1)", a1: "Certificat A1" };

export async function saveWorkerDocumentTokenAction(
  token: string,
  kind: WorkerDocKind,
  fileB64: string,
  mime: string,
): Promise<{ ok: boolean; error?: string; iaStatus?: string | null }> {
  if (kind !== "limosa" && kind !== "a1") return { ok: false, error: "Type de document invalide." };
  if (!fileB64) return { ok: false, error: "Aucun fichier." };

  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("contract_info_tokens")
    .select("employee_id, candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (!tok) return { ok: false, error: "Lien invalide ou expiré." };
  const t = tok as { employee_id: string | null; candidate_id: string | null };
  const owner = t.employee_id
    ? { col: "employee_id" as const, id: t.employee_id, folder: "employees" }
    : t.candidate_id
      ? { col: "candidate_id" as const, id: t.candidate_id, folder: "candidates" }
      : null;
  if (!owner) return { ok: false, error: "Lien invalide." };

  const bytes = decodeDataUrl(fileB64);
  if (bytes.byteLength === 0) return { ok: false, error: "Fichier vide." };
  const ext = /pdf/i.test(mime) ? "pdf" : /png/i.test(mime) ? "png" : /webp/i.test(mime) ? "webp" : "jpg";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${owner.folder}/${owner.id}/${kind}-${ts}.${ext}`;

  const up = await admin.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: true });
  if (up.error) return { ok: false, error: up.error.message };

  // Remplace l'ancien document du même type.
  const { data: olds } = await admin
    .from("documents")
    .select("id, storage_path")
    .eq(owner.col, owner.id)
    .eq("kind", kind);
  const oldPaths = ((olds ?? []) as Array<{ storage_path: string | null }>)
    .map((o) => o.storage_path)
    .filter((p): p is string => !!p && p !== path);
  if (oldPaths.length) {
    try { await admin.storage.from("documents").remove(oldPaths); } catch { /* */ }
  }
  if (olds && olds.length) {
    try { await admin.from("documents").delete().eq(owner.col, owner.id).eq("kind", kind); } catch { /* */ }
  }

  const { data: ins, error: insErr } = await admin
    .from("documents")
    .insert({
      [owner.col]: owner.id,
      kind,
      storage_path: path,
      file_name: LABEL[kind],
      mime_type: mime,
      size_bytes: bytes.byteLength,
      validation_status: "accepted",
    })
    .select("id, storage_path, mime_type")
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message };

  // Contrôle IA (conformité + validité + expiration) — best-effort.
  let iaStatus: string | null = null;
  try {
    const doc = ins as { id: string; storage_path: string; mime_type: string | null };
    const r = await checkDocumentConformity(admin, doc);
    if (r.ok) iaStatus = r.result?.status ?? null;
  } catch {
    /* non bloquant */
  }
  return { ok: true, iaStatus };
}
