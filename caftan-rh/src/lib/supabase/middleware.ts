import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/auth",
  "/postuler",
  "/api/postuler",
  // Karim 2026-06-13 (Phase 1) : connexion candidat par lien magique. La page de
  // login candidat doit etre publique ; l'espace /candidat lui-meme reste protege.
  "/candidat/login",
  "/upload",
  "/api/documents/upload",
  // Karim 18/05 : pre-interview accessible au candidat externe (token-protected
  // dans la page elle-meme). Sans ca, le mail "Repondre au pre-entretien"
  // redirige vers /login alors que le candidat n a aucun compte.
  "/pre-interview",
  "/api/pre-interview",
  // Karim 22/05 : page signature digitale de contrat (token-protected).
  // L employe n a peut-etre pas encore de compte au moment de la signature.
  "/sign",
  // Karim 2026-06-17 : signature INTERNE de la convention de rupture amiable
  // (token-protected dans la page). Remplace DocuSeal. Le travailleur signe sans compte.
  "/sign-termination",
  // Karim 2026-06-15 : route PDF du contrat (super layout) — token-protected
  // dans le handler (signing_token). Le candidat n'est pas connecte.
  "/api/contracts/sign",
  // Karim 2026-06-13 : page de reponse au pre-avis de renouvellement CDD/Etudiant
  // (token-protected dans la page). Le travailleur repond sans se connecter.
  "/renewal",
  // Karim 2026-06-13 : page "completer mon dossier" (infos manquantes) a TOKEN.
  // Remplace l'ancien magic link casse. Le travailleur remplit sans compte.
  "/contract-info",
  // Karim 2026-07-09 (Phase 3) : tablette PARTAGEE en magasin. Page publique :
  // le travailleur saisit son CODE PERSONNEL (clavier numerique) pour voir SON
  // planning par defaut en lecture seule. La resolution est un server action
  // service-role (le code fait office de commodite, pas d'auth forte).
  "/tablette",
  // Karim 2026-06-01 : lettre 402.00 rupture amiable. Auth multi-mode geree
  // dans le handler (session admin/RH/employee OU token ?t=... pour mail).
  // Sans cette exemption, le middleware redirige vers /login meme avec un
  // token valide, et le clic depuis le mail / l'admin sur tunnel KO.
  "/api/terminations",
  // Karim 2026-06-01 : route tracking view PDF (token-protected dans handler).
  "/api/docs/view",
  // Karim 2026-06-02 : webhook DocuSeal (signature HMAC dans handler).
  "/api/docuseal/webhook",
  // Routes cron : Vercel Cron Scheduler les appelle SANS cookie utilisateur.
  // Chaque route verifie son propre Bearer ${CRON_SECRET} cote handler.
  "/api/cron",
  // Karim 2026-06-09 : routes internes appelees par triggers Postgres
  // (pg_net) ou autres webhooks systeme. Auth Bearer cote handler.
  "/api/internal",
  // Routes push web : web-push ne peut pas porter de cookie utilisateur.
  "/api/push",
  // Endpoints de debug RH : auth verifie par requireRole dans le handler.
  "/api/debug",
  // Assets PWA : iOS Safari lit le manifest AVANT le login pour decider de
  // mode standalone vs raccourci. Si on redirige vers /login, l'app n'est
  // pas detectee comme PWA et reste en mode navigateur (barre d'adresse).
  "/manifest.webmanifest",
  "/m/manifest.webmanifest",
  "/sw.js",
  "/icons",
  "/favicon.ico",
  "/apple-touch-icon.png",
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Env not configured yet — let the request through so devs can see the home page
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          // Karim 2026-06-13 : force une longue duree de vie sur les cookies
          // d'auth Supabase (sb-*) pour qu'ils SURVIVENT a la fermeture de la
          // PWA iOS. Sinon ils sont traites comme cookies de session, effaces a
          // la fermeture -> re-login a chaque reouverture. Le refresh_token
          // restant valide, la session est conservee tant qu'on ne se deconnecte
          // pas manuellement.
          const opts = name.startsWith("sb-")
            ? { ...options, maxAge: 60 * 60 * 24 * 400 }
            : options;
          response.cookies.set(name, value, opts);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const next = request.nextUrl.clone();
    // Karim 2026-06-13 (Phase 1) : les routes candidat ont leur propre login
    // (lien magique), pas le login staff (mot de passe).
    next.pathname = pathname.startsWith("/candidat") ? "/candidat/login" : "/login";
    next.searchParams.set("next", pathname);
    return NextResponse.redirect(next);
  }

  if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/candidat/login")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const next = request.nextUrl.clone();
    next.pathname = await resolveHomeMw(
      supabase,
      user.id,
      (profile as { role?: string } | null)?.role ?? "candidate",
    );
    next.search = "";
    return NextResponse.redirect(next);
  }

  return response;
}

export function roleHome(role: string) {
  switch (role) {
    case "admin":
    case "rh":
    case "manager":
      return "/planning/calendar";
    case "employee":
      return "/me";
    default:
      return "/me";
  }
}

// Karim 2026-06-13 (Phase 1) : meme logique que resolveHome (lib/auth) mais
// locale au middleware (evite d'importer du code server-only dans le proxy).
// Distingue le vrai candidat (-> /candidat) de l'employe encore en role
// 'candidate' (fiche employees presente -> /me).
async function resolveHomeMw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  role: string,
): Promise<string> {
  if (role === "admin" || role === "rh" || role === "manager") return "/planning/calendar";
  if (role === "employee") return "/me";
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return emp ? "/me" : "/candidat";
}
