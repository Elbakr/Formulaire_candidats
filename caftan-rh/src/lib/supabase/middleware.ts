import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/auth",
  "/postuler",
  "/api/postuler",
  "/upload",
  "/api/documents/upload",
  // Karim 18/05 : pre-interview accessible au candidat externe (token-protected
  // dans la page elle-meme). Sans ca, le mail "Repondre au pre-entretien"
  // redirige vers /login alors que le candidat n a aucun compte.
  "/pre-interview",
  "/api/pre-interview",
  // Routes cron : Vercel Cron Scheduler les appelle SANS cookie utilisateur.
  // Chaque route verifie son propre Bearer ${CRON_SECRET} cote handler.
  "/api/cron",
  // Routes push web : web-push ne peut pas porter de cookie utilisateur.
  "/api/push",
  // Endpoints de debug RH : auth verifie par requireRole dans le handler.
  "/api/debug",
  // Assets PWA : iOS Safari lit le manifest AVANT le login pour decider de
  // mode standalone vs raccourci. Si on redirige vers /login, l'app n'est
  // pas detectee comme PWA et reste en mode navigateur (barre d'adresse).
  "/manifest.webmanifest",
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
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const next = request.nextUrl.clone();
    next.pathname = "/login";
    next.searchParams.set("next", pathname);
    return NextResponse.redirect(next);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const next = request.nextUrl.clone();
    next.pathname = roleHome((profile as { role?: string } | null)?.role ?? "candidate");
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
    default:
      return "/me";
  }
}
