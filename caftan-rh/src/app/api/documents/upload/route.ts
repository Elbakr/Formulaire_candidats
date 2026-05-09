// POST /api/documents/upload  — PUBLIC (no auth)
// Reçoit un fichier + token, valide, upload Storage, crée documents row,
// marque le token used, prévient les RH par notification + insère un message inbound.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateToken, markTokenUsed } from "@/lib/documents/tokens";
import { getCatalog } from "@/lib/documents/catalog";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData invalide." }, { status: 400 });
  }

  const token = String(formData.get("token") ?? "").trim();
  const file = formData.get("file");
  if (!token) return NextResponse.json({ error: "Token requis." }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop lourd (max ${Math.round(MAX_BYTES / 1024 / 1024)} Mo).` },
      { status: 400 },
    );
  }

  const tokenRow = await validateToken(token);
  if (!tokenRow) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 410 });
  }

  const catalog = tokenRow.doc_slug ? await getCatalog(tokenRow.doc_slug) : null;
  const admin = createAdminClient();

  // ── Upload Storage : tokens/<token>/<filename>
  const safeFileName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 200) || "document";
  const storagePath = `tokens/${tokenRow.token}/${Date.now()}-${safeFileName}`;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const upload = await admin.storage.from("documents").upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  // ── Insert documents row
  const docKindMap: Record<string, string> = {
    cv: "cv",
    cover_letter: "cover_letter",
    id_card_front: "id_card",
    id_card_back: "id_card",
    diploma: "diploma",
  };
  const legacyKind = (tokenRow.doc_slug && docKindMap[tokenRow.doc_slug]) || "other";

  const { data: docInsert, error: insertErr } = await admin
    .from("documents")
    .insert({
      application_id: tokenRow.application_id,
      candidate_id: tokenRow.candidate_id,
      employee_id: tokenRow.employee_id,
      catalog_slug: tokenRow.doc_slug,
      kind: legacyKind,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: tokenRow.created_by, // pas vraiment, mais on n'a pas d'utilisateur authentifié
      upload_token_id: tokenRow.id,
      validation_status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !docInsert) {
    // Cleanup storage on failure
    await admin.storage.from("documents").remove([storagePath]).catch(() => undefined);
    return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  await markTokenUsed(tokenRow.id);

  // ── Notif RH/admin
  const { data: rhUsers } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
  const rh = (rhUsers ?? []) as { id: string }[];
  if (rh.length > 0) {
    const link = tokenRow.application_id
      ? `/rh/candidates/${tokenRow.application_id}?tab=dossier-docs`
      : "/rh/messages";
    await admin.from("notifications").insert(
      rh.map((u) => ({
        recipient_id: u.id,
        kind: "document_received",
        title: "Document reçu",
        body: `Document "${catalog?.label ?? tokenRow.doc_slug ?? "fichier"}" reçu via magic link.`,
        link,
        data: {
          document_id: (docInsert as { id: string }).id,
          token_id: tokenRow.id,
          doc_slug: tokenRow.doc_slug,
          application_id: tokenRow.application_id,
          candidate_id: tokenRow.candidate_id,
          employee_id: tokenRow.employee_id,
        },
      })),
    );
  }

  // ── Message inbound (si attaché à une application)
  if (tokenRow.application_id) {
    await admin.from("messages").insert({
      application_id: tokenRow.application_id,
      direction: "inbound",
      sender_id: null,
      subject: `Document reçu : ${catalog?.label ?? tokenRow.doc_slug ?? "fichier"}`,
      body: `Le candidat a uploadé un document via magic link : ${file.name}.`,
      email_provider_id: "magic-link",
    });
  }

  await logActivity({
    kind: "document.upload_link.used",
    targetType: tokenRow.application_id ? "application" : undefined,
    targetId:
      tokenRow.application_id ?? tokenRow.candidate_id ?? tokenRow.employee_id ?? null,
    description: `Document reçu : ${catalog?.label ?? tokenRow.doc_slug ?? file.name}`.slice(0, 200),
    actorId: null,
    actorLabel: "candidat (magic link)",
    data: {
      document_id: (docInsert as { id: string }).id,
      token_id: tokenRow.id,
      doc_slug: tokenRow.doc_slug,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
  });

  return NextResponse.json({
    ok: true,
    documentId: (docInsert as { id: string }).id,
  });
}
