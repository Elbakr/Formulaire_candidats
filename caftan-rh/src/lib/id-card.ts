import "server-only";

// Karim 2026-06-17 : carte d'identité du travailleur. On reçoit recto + verso
// (images JPEG/PNG), on les fusionne en UN SEUL PDF (2 pages A4) via pdf-lib
// (déjà dans le projet — aucune dépendance externe), et on stocke ce PDF dans
// le bucket `documents` lié à la fiche travailleur (kind = 'id_card'). Sert au
// dossier RH et à l'envoi au secrétariat social.

import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "documents";
// A4 portrait en points PDF.
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 24;

export type IdCardImage = { bytes: Uint8Array; mime: string };

export type IdCardDoc = {
  id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
};

/** Fusionne 1..n images (recto/verso) en un seul PDF A4, une image par page. */
export async function buildIdCardPdf(images: IdCardImage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const img of images) {
    const isPng = /png/i.test(img.mime);
    const embedded = isPng ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const maxW = A4_W - MARGIN * 2;
    const maxH = A4_H - MARGIN * 2;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    const page = pdf.addPage([A4_W, A4_H]);
    page.drawImage(embedded, { x: (A4_W - w) / 2, y: (A4_H - h) / 2, width: w, height: h });
  }
  return await pdf.save();
}

/** Carte d'identité actuelle (la plus récente) d'un employé, ou null. */
export async function getEmployeeIdCard(
  admin: SupabaseClient,
  employeeId: string,
): Promise<IdCardDoc | null> {
  const { data } = await admin
    .from("documents")
    .select("id, storage_path, file_name, created_at")
    .eq("employee_id", employeeId)
    .eq("kind", "id_card")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as IdCardDoc | null) ?? null;
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "employe"
  );
}

/**
 * Construit le PDF recto/verso et le stocke (remplace l'ancienne CI de l'employé
 * s'il y en avait une). Retourne l'id du document créé.
 */
export async function saveIdCardForEmployee(
  admin: SupabaseClient,
  employeeId: string,
  images: IdCardImage[],
  uploadedBy: string | null,
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  if (!employeeId) return { ok: false, error: "Employé manquant." };
  if (images.length === 0) return { ok: false, error: "Aucune image fournie." };

  let pdf: Uint8Array;
  try {
    pdf = await buildIdCardPdf(images);
  } catch (e) {
    console.warn("[id-card] build PDF KO:", (e as Error).message);
    return { ok: false, error: "Image illisible. Formats acceptés : JPEG ou PNG." };
  }

  const { data: emp } = await admin
    .from("employees")
    .select("full_name")
    .eq("id", employeeId)
    .maybeSingle();
  const name = (emp as { full_name?: string } | null)?.full_name ?? "employe";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `employees/${employeeId}/carte-identite-${ts}.pdf`;

  const up = await admin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, error: up.error.message };

  // Remplace l'ancienne CI : on supprime fichiers + lignes précédentes (≠ nouveau).
  const { data: olds } = await admin
    .from("documents")
    .select("id, storage_path")
    .eq("employee_id", employeeId)
    .eq("kind", "id_card");
  const oldPaths = ((olds ?? []) as Array<{ id: string; storage_path: string | null }>)
    .map((o) => o.storage_path)
    .filter((p): p is string => !!p && p !== path);
  if (oldPaths.length) {
    try { await admin.storage.from(BUCKET).remove(oldPaths); } catch { /* */ }
  }
  if (olds && olds.length) {
    try { await admin.from("documents").delete().eq("employee_id", employeeId).eq("kind", "id_card"); } catch { /* */ }
  }

  const fileName = `Carte d'identite - ${slugify(name)}.pdf`;
  const { data: ins, error: insErr } = await admin
    .from("documents")
    .insert({
      employee_id: employeeId,
      application_id: null,
      candidate_id: null,
      kind: "id_card",
      storage_path: path,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: pdf.byteLength,
      uploaded_by: uploadedBy,
      validation_status: "accepted",
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true, documentId: (ins as { id: string } | null)?.id };
}
