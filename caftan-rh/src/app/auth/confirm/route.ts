import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveHome } from "@/lib/auth";

// Karim 2026-06-13 (Phase 1 fix) : confirmation d'un lien magique candidat.
//
// IMPORTANT : on NE s'appuie PAS sur le `redirect_to` de Supabase (qui, si
// l'URL n'est pas dans l'allow-list du dashboard, retombe sur le "Site URL"
// configuré = parfois localhost -> lien cassé). À la place, l'email pointe vers
// CETTE route, sur notre domaine stable, avec le `token_hash` généré par
// admin.generateLink. On vérifie le token ici (verifyOtp) -> session posée ->
// redirection. Aucune dépendance à la config Auth du dashboard.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const nextRaw = searchParams.get("next") ?? "/candidat";
  const next = nextRaw.startsWith("/") ? nextRaw : "/candidat";

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Si pas de cible explicite, on résout l'accueil selon le rôle.
      let dest = next;
      if (!next || next === "/candidat") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          dest = await resolveHome(supabase, user.id, (profile as { role?: string } | null)?.role ?? "candidate");
        }
      }
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/candidat/login?error=link_expired`);
}
