// GET /api/cron/doc-chaser  — quotidien (vercel cron)
// Pour chaque candidature 'hired' dans les 90 derniers jours :
//   - calcule les docs manquants
//   - crée un magic link pour chaque doc manquant qui n'a PAS de token actif (depuis 5j)
//   - log un message inbound de "rappel auto"
//
// Décision : on ne déclenche PAS l'envoi d'email automatique pour l'instant.
// Le patron est en P1 (suggestion seulement). On crée juste les liens et on
// notifie les RH ; ils peuvent envoyer manuellement depuis le tab "Dossier docs".
// Si plus tard on ajoute `org_settings.ai_autonomy_level` >= 1, on activera l'auto-send.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { computeMissingDocs } from "@/lib/documents/missing";
import { createUploadToken } from "@/lib/documents/tokens";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const RECENT_TOKEN_DAYS = 5;
const HIRED_LOOKBACK_DAYS = 90;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - HIRED_LOOKBACK_DAYS * 86_400_000).toISOString();
  const cutoffRecent = new Date(Date.now() - RECENT_TOKEN_DAYS * 86_400_000).toISOString();

  // Hired applications in the last 90 days
  const { data: appsRaw } = await admin
    .from("applications")
    .select("id, candidate_id, status, updated_at")
    .eq("status", "hired")
    .gte("updated_at", since);
  type AppRow = { id: string; candidate_id: string; status: string; updated_at: string };
  const apps = (appsRaw ?? []) as unknown as AppRow[];

  let tokensCreated = 0;
  let appsScanned = 0;
  const errors: Array<{ application_id: string; error: string }> = [];

  // Notifications par RH à la fin
  const docsNoticed: Array<{
    application_id: string;
    candidate_id: string;
    doc_slug: string;
    doc_label: string;
    upload_url: string;
  }> = [];

  for (const app of apps) {
    appsScanned += 1;
    try {
      const missing = await computeMissingDocs({
        applicationId: app.id,
        candidateId: app.candidate_id,
      });
      // Filtre : pas de fichier accepté, pas de token actif, et pas de token créé < 5j
      // Puisque computeMissingDocs filtre déjà sur token "active", on rajoute le check récent.
      const { data: recentRaw } = await admin
        .from("document_upload_tokens")
        .select("doc_slug, created_at")
        .eq("application_id", app.id)
        .gte("created_at", cutoffRecent);
      const recent = (recentRaw ?? []) as unknown as Array<{ doc_slug: string | null }>;
      const recentSlugs = new Set(recent.map((t) => t.doc_slug).filter(Boolean) as string[]);

      const todo = missing.filter(
        (m) => !m.hasFile && !m.has_pending_token && !recentSlugs.has(m.slug),
      );

      for (const m of todo) {
        const tokenResult = await createUploadToken({
          applicationId: app.id,
          candidateId: app.candidate_id,
          docSlug: m.slug,
          ttlDays: 7,
          createdBy: null,
        });
        if (!tokenResult.ok) continue;
        tokensCreated += 1;
        docsNoticed.push({
          application_id: app.id,
          candidate_id: app.candidate_id,
          doc_slug: m.slug,
          doc_label: m.label,
          upload_url: tokenResult.url,
        });

        // Log message inbound interne (note auto pour traçabilité)
        await admin.from("messages").insert({
          application_id: app.id,
          direction: "outbound",
          sender_id: null,
          subject: `[doc-chaser] Lien créé : ${m.label}`,
          body: `Lien upload créé automatiquement pour ${m.label}. URL : ${tokenResult.url}`,
          email_provider_id: "doc-chaser",
        });

        await logActivity({
          kind: "document.upload_link.created",
          targetType: "application",
          targetId: app.id,
          description: `[doc-chaser] Lien auto créé : ${m.label}`.slice(0, 200),
          actorId: null,
          actorLabel: "doc-chaser (cron)",
          data: { doc_slug: m.slug, token_id: tokenResult.id, auto: true },
        });
      }
    } catch (e) {
      errors.push({ application_id: app.id, error: (e as Error).message });
    }
  }

  // Notifie les RH (1 notif récap par RH)
  if (docsNoticed.length > 0) {
    const { data: rhUsers } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "rh"]);
    const rh = (rhUsers ?? []) as { id: string }[];
    if (rh.length > 0) {
      await admin.from("notifications").insert(
        rh.map((u) => ({
          recipient_id: u.id,
          kind: "doc_chaser_summary",
          title: `${docsNoticed.length} document(s) à demander`,
          body: `Le doc-chaser a créé ${docsNoticed.length} lien(s) magique(s). Va voir l'onglet "Dossier docs" des candidats embauchés concernés.`,
          link: "/rh/candidates",
          data: {
            count: docsNoticed.length,
            applications: Array.from(new Set(docsNoticed.map((d) => d.application_id))),
          },
        })),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    apps_scanned: appsScanned,
    tokens_created: tokensCreated,
    errors,
  });
}
