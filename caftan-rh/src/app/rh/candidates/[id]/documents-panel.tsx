// Server component : tab "Dossier docs" sur la fiche candidat.
// Affiche : (1) docs reçus, (2) docs manquants, (3) liens magiques actifs.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { computeMissingDocs } from "@/lib/documents/missing";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { DocumentsPanelClient } from "./documents-panel-client";

type ExistingDoc = {
  id: string;
  file_name: string;
  catalog_slug: string | null;
  kind: string;
  validation_status: string | null;
  rejection_reason: string | null;
  storage_path: string;
  created_at: string;
  validated_at: string | null;
  upload_token_id: string | null;
};

type ActiveToken = {
  id: string;
  token: string;
  doc_slug: string | null;
  doc_label: string;
  expires_at: string;
  created_at: string;
  hint: string | null;
};

export async function DocumentsPanel({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Récupère le candidate_id depuis l'application
  const { data: app } = await supabase
    .from("applications")
    .select("id, candidate_id")
    .eq("id", applicationId)
    .single();
  const a = app as unknown as { id: string; candidate_id: string } | null;
  if (!a) {
    return (
      <Card>
        <div className="p-4 text-sm text-ink-3">Application introuvable.</div>
      </Card>
    );
  }

  // ── Documents reçus (par application_id OU candidate_id)
  const { data: docsRaw } = await admin
    .from("documents")
    .select(
      "id, file_name, catalog_slug, kind, validation_status, rejection_reason, storage_path, created_at, validated_at, upload_token_id",
    )
    .or(`application_id.eq.${applicationId},candidate_id.eq.${a.candidate_id}`)
    .order("created_at", { ascending: false });
  const docs = (docsRaw ?? []) as unknown as ExistingDoc[];

  // ── Missing docs
  const missing = await computeMissingDocs({ applicationId, candidateId: a.candidate_id });

  // ── Tokens actifs
  const { data: tokensRaw } = await admin
    .from("document_upload_tokens")
    .select(
      "id, token, doc_slug, expires_at, created_at, hint",
    )
    .or(`application_id.eq.${applicationId},candidate_id.eq.${a.candidate_id}`)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const tokensSrc = (tokensRaw ?? []) as unknown as Array<{
    id: string;
    token: string;
    doc_slug: string | null;
    expires_at: string;
    created_at: string;
    hint: string | null;
  }>;

  // Récupère les labels du catalogue
  const slugs = Array.from(
    new Set([
      ...tokensSrc.map((t) => t.doc_slug).filter(Boolean) as string[],
      ...docs.map((d) => d.catalog_slug).filter(Boolean) as string[],
    ]),
  );
  const labelMap = new Map<string, string>();
  if (slugs.length > 0) {
    const { data: cat } = await admin
      .from("document_catalog")
      .select("slug, label")
      .in("slug", slugs);
    for (const c of (cat ?? []) as { slug: string; label: string }[]) {
      labelMap.set(c.slug, c.label);
    }
  }
  const tokens: ActiveToken[] = tokensSrc.map((t) => ({
    id: t.id,
    token: t.token,
    doc_slug: t.doc_slug,
    doc_label: t.doc_slug ? (labelMap.get(t.doc_slug) ?? t.doc_slug) : "Document",
    expires_at: t.expires_at,
    created_at: t.created_at,
    hint: t.hint,
  }));

  // Récupère URL signée pour chaque doc reçu (1h)
  const signedMap = new Map<string, string>();
  for (const d of docs) {
    const { data } = await admin.storage.from("documents").createSignedUrl(d.storage_path, 3600);
    if (data?.signedUrl) signedMap.set(d.id, data.signedUrl);
  }

  // App URL pour copier/coller des magic links (si on veut afficher l'URL complète)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-4">
      <DocumentsPanelClient
        applicationId={applicationId}
        baseUrl={baseUrl}
        docs={docs.map((d) => ({
          id: d.id,
          file_name: d.file_name,
          catalog_slug: d.catalog_slug,
          catalog_label: d.catalog_slug ? (labelMap.get(d.catalog_slug) ?? d.catalog_slug) : d.kind,
          kind: d.kind,
          validation_status: d.validation_status,
          rejection_reason: d.rejection_reason,
          created_at: d.created_at,
          validated_at: d.validated_at,
          signed_url: signedMap.get(d.id) ?? null,
        }))}
        missing={missing}
        tokens={tokens}
      />
      <p className="text-[10px] text-ink-3 px-1">
        Mis à jour {formatDateTime(new Date().toISOString())} · {docs.length} reçu(s) · {missing.filter((m) => !m.hasFile).length} manquant(s) · {tokens.length} lien(s) actif(s)
      </p>
    </div>
  );
}
