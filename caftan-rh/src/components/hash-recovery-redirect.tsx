"use client";

// Karim 2026-05-29 : intercepte les hash fragments Supabase qui contiennent
// type=recovery (apres clic sur magic link reset password). Si Supabase
// redirige vers la racine au lieu de /login/reset-password (config Redirect
// URLs ratee), on rediriger nous-meme vers la bonne page en preservant le hash.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HashRecoveryRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");
    const errorCode = params.get("error_code");
    const accessToken = params.get("access_token");

    // Cas 1 : magic link valide -> rediriger vers reset-password avec le hash
    if (type === "recovery" && accessToken) {
      if (!window.location.pathname.includes("/login/reset-password")) {
        window.location.replace(`/login/reset-password${hash}`);
      }
      return;
    }

    // Cas 2 : token expire ou invalide -> rediriger vers forgot-password
    // avec message clair (PAS de redirect en boucle si on est deja sur forgot)
    if (errorCode === "otp_expired" || errorCode === "access_denied") {
      if (!window.location.pathname.includes("/login/forgot-password")) {
        const errDesc = params.get("error_description") ?? "Le lien a expiré";
        router.push(`/login/forgot-password?error=${encodeURIComponent(errDesc.replace(/\+/g, " "))}`);
      }
      return;
    }
  }, [router]);
  return null;
}
