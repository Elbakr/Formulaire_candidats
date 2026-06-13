import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Karim 2026-06-13 : ACTIVE le rafraichissement de session Supabase.
// Le helper updateSession existait deja (src/lib/supabase/middleware.ts) mais
// n'etait jamais execute (aucun middleware.ts a la racine src/). Resultat : le
// token d'acces (1h) n'etait jamais rafraichi cote serveur -> a la reouverture
// de l'app apres expiration, le rendu serveur voyait une session expiree et
// renvoyait vers /login. Avec ce middleware, le token est rafraichi a chaque
// chargement de page -> on reste connecte tant qu'on ne se deconnecte pas.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Le middleware s'execute sur les PAGES uniquement. On exclut :
  //  - /api (webhooks/cron font leur propre auth Bearer cote handler — ne pas
  //    les rediriger vers /login),
  //  - les assets _next + fichiers statiques (sw.js, icones, manifest, etc.).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|webmanifest|txt|woff2?)$).*)",
  ],
};
