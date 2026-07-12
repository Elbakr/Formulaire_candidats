// Karim 2026-07-10 (Phase 3) : chemin OBSCUR de la tablette planning.
// /t/<jeton> où <jeton> = jeton d'appareil (secret d'URL) configuré par l'admin
// dans /admin/settings. On valide le jeton contre org_settings.tablet_device_token.
//   - jeton valide         -> expérience tablette existante (réutilise TabletteClient)
//   - admin connecté       -> accès preview même sans/mauvais jeton
//   - sinon                -> 404 (notFound)
// Aucun jeton configuré = accès public refusé (404), sauf admin.
//
// C'est la PREMIÈRE barrière (secret d'appareil). Le CODE PERSONNEL du
// travailleur reste requis EN PLUS dans TabletteClient (double barrière).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth";
import { TabletteClient } from "../../tablette/tablette-client";

export const dynamic = "force-dynamic";

// Karim 2026-07-10 (Phase 3) : ces métadonnées SURCHARGENT, pour cette route
// uniquement, le manifest global (start_url "/", short_name "CaftanRH") et le
// titre iOS « CaftanRH ». Résultat sur la tablette :
//   - manifest dédié -> l'icône rouvre DIRECTEMENT /t/<jeton> (pas de login app)
//   - titre + apple title « Planning » -> l'icône s'appelle « Planning »
// iOS lance le raccourci sur l'URL courante (/t/<jeton>) et lit apple title ;
// Android lit le manifest et son start_url. Les deux plateformes sont couvertes.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Planning",
    applicationName: "Planning",
    manifest: `/t/${encodeURIComponent(token)}/pwa`,
    appleWebApp: {
      capable: true,
      title: "Planning",
      statusBarStyle: "black-translucent",
    },
  };
}

async function isValidDeviceToken(token: string): Promise<boolean> {
  const t = (token ?? "").trim();
  // Jeton base64url ~43 chars ; on rejette d'emblée le trivial pour couper court
  // à toute énumération. Comparaison stricte, aucun fallback si NULL en base.
  if (t.length < 24) return false;
  const admin = createAdminClient();

  // 1) Jetons MULTI-TABLETTES (A..G) — table tablet_devices (actifs uniquement).
  const { data: dev } = await admin
    .from("tablet_devices")
    .select("id")
    .eq("token", t)
    .eq("active", true)
    .maybeSingle();
  if (dev) return true;

  // 2) Compat : ancien jeton unique org_settings.tablet_device_token (tablette A).
  const { data } = await admin
    .from("org_settings")
    .select("tablet_device_token")
    .eq("id", 1)
    .maybeSingle();
  const configured =
    (data as { tablet_device_token: string | null } | null)?.tablet_device_token ?? null;
  if (!configured) return false; // aucun jeton -> refus public
  return configured === t;
}

export default async function TabletTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await isValidDeviceToken(token);
  if (!valid) {
    // Admin connecté : accès preview autorisé quel que soit le jeton.
    const admin = await isAdminSession();
    if (!admin) notFound();
  }
  return <TabletteClient />;
}
