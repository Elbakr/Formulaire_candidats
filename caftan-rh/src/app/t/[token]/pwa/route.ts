// Karim 2026-07-10 (Phase 3) : MANIFEST PWA dédié à la tablette planning.
//
// Problème résolu : le manifest GLOBAL (src/app/manifest.ts) a `start_url: "/"`
// et `short_name: "CaftanRH"`. Quand on installe /t/<jeton> sur l'écran d'accueil
// puis qu'on lance l'ICÔNE, Android rouvre `/` (page protégée -> login admin de
// l'app) et l'icône s'appelle « CaftanRH ». Aucun des deux n'est voulu sur une
// tablette magasin.
//
// Ici on sert un manifest PROPRE à chaque jeton :
//   - start_url / scope = /t/<jeton>  -> l'icône rouvre DIRECTEMENT le planning
//   - name / short_name = « Planning » -> aucune trace de caftan/rh/vercel
//   - display standalone               -> plein écran, pas de barre d'adresse
//
// La route vit sous /t/... donc elle est déjà PUBLIQUE (middleware PUBLIC_ROUTES).
// Chemins RELATIFS volontaires : fonctionnent aussi bien sur l'alias Vercel que
// sur un futur domaine neutre, sans rien changer.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const base = `/t/${encodeURIComponent(token)}`;

  const manifest = {
    id: base,
    name: "Planning",
    short_name: "Planning",
    description: "Planning du magasin",
    start_url: base,
    scope: base,
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#18181b",
    orientation: "portrait",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
