"use server";

// Server actions pour la vue centralisée /admin/documents.
// La validation (accept/reject) est déléguée à validateDocumentAction
// défini dans rh/candidates/[id]/documents-actions.ts (ne pas dupliquer).

import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

function isExternalUrl(p: string | null | undefined): p is string {
  return !!p && /^https?:\/\//i.test(p);
}

/**
 * Retourne une URL exploitable pour visualiser/télécharger un document.
 * - storage_path commence par http(s):// → URL renvoyée telle quelle.
 * - Sinon → URL signée Supabase Storage (bucket "documents", TTL 1h).
 */
export async function getSignedDocUrlAction(
  documentId: string,
): Promise<{ ok: true; url: string; external: boolean; file_name: string; mime_type: string | null } | { error: string }> {
  await requireRole(["admin", "rh"]);
  if (!documentId) return { error: "documentId requis." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("documents")
    .select("id, storage_path, file_name, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  type Row = { id: string; storage_path: string; file_name: string; mime_type: string | null };
  const d = row as unknown as Row | null;
  if (!d) return { error: "Document introuvable." };

  if (isExternalUrl(d.storage_path)) {
    return {
      ok: true,
      url: d.storage_path,
      external: true,
      file_name: d.file_name,
      mime_type: d.mime_type,
    };
  }

  const { data: signed, error } = await admin.storage
    .from("documents")
    .createSignedUrl(d.storage_path, 3600);
  if (error || !signed?.signedUrl) {
    return { error: error?.message ?? "Impossible de générer l'URL signée." };
  }
  return {
    ok: true,
    url: signed.signedUrl,
    external: false,
    file_name: d.file_name,
    mime_type: d.mime_type,
  };
}

/**
 * Retourne, pour une liste de document_id, des paires {filename, url}.
 * Le client déclenche les téléchargements séquentiellement.
 */
export async function bulkDownloadDocsAction(
  documentIds: string[],
): Promise<{ ok: true; items: Array<{ id: string; file_name: string; url: string; external: boolean }> } | { error: string }> {
  await requireRole(["admin", "rh"]);
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { error: "Aucun document sélectionné." };
  }
  if (documentIds.length > 200) {
    return { error: "Trop de documents (max 200)." };
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("documents")
    .select("id, storage_path, file_name")
    .in("id", documentIds);
  type Row = { id: string; storage_path: string; file_name: string };
  const docs = (rows ?? []) as unknown as Row[];

  const items: Array<{ id: string; file_name: string; url: string; external: boolean }> = [];
  for (const d of docs) {
    if (isExternalUrl(d.storage_path)) {
      items.push({ id: d.id, file_name: d.file_name, url: d.storage_path, external: true });
      continue;
    }
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(d.storage_path, 3600);
    if (signed?.signedUrl) {
      items.push({ id: d.id, file_name: d.file_name, url: signed.signedUrl, external: false });
    }
  }
  return { ok: true, items };
}
