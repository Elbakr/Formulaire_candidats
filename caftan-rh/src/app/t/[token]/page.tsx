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
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { isAdminSession } from "@/lib/auth";
import { TabletteClient } from "../../tablette/tablette-client";
import { TabletEnroll, TabletDenied } from "./tablet-gate";
import { sha256, TABLET_BIND_COOKIE_PREFIX } from "./binding";

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

type DeviceRow = { code: string; bound_secret: string | null };

/** Résout la tablette (active) pour ce jeton, ou null. */
async function resolveTablet(token: string): Promise<DeviceRow | null> {
  const t = (token ?? "").trim();
  if (t.length < 24) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("tablet_devices")
    .select("code, bound_secret")
    .eq("token", t)
    .eq("active", true)
    .maybeSingle();
  return (data as DeviceRow | null) ?? null;
}

/** Compat : ancien jeton unique org_settings.tablet_device_token (avant multi-tablettes). */
async function isLegacyToken(token: string): Promise<boolean> {
  const t = (token ?? "").trim();
  if (t.length < 24) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_settings")
    .select("tablet_device_token")
    .eq("id", 1)
    .maybeSingle();
  const configured = (data as { tablet_device_token: string | null } | null)?.tablet_device_token ?? null;
  return !!configured && configured === t;
}

export default async function TabletTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = await isAdminSession();

  const tablet = await resolveTablet(token);

  // Jeton inconnu / inactif -> compat ancien jeton unique, sinon 404 (sauf admin preview).
  if (!tablet) {
    if (admin) return <TabletteClient />;
    if (await isLegacyToken(token)) return <TabletteClient />;
    notFound();
  }

  // Admin connecté : preview direct, sans enrôler cet appareil.
  if (admin) return <TabletteClient />;

  // VERROUILLAGE APPAREIL :
  //  - pas encore enrôlée -> écran d'activation (lie CET appareil).
  //  - enrôlée + cookie de CET appareil correspond -> accès.
  //  - enrôlée + cookie absent/différent (autre appareil) -> refus.
  if (!tablet.bound_secret) {
    return <TabletEnroll token={token} />;
  }
  const c = await cookies();
  const secret = c.get(`${TABLET_BIND_COOKIE_PREFIX}${tablet.code}`)?.value ?? "";
  if (secret && sha256(secret) === tablet.bound_secret) {
    return <TabletteClient />;
  }
  return <TabletDenied />;
}
