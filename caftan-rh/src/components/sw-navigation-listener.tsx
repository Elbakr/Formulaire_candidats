"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Karim 2026-06-14 : routage GLOBAL des clics de notification push.
// Le service worker (notificationclick) poste { type:"NOTIF_NAVIGATE", url } a
// la fenetre ; on route en SPA (router.push). Monte dans le LAYOUT RACINE pour
// couvrir TOUTES les pages (/m, /candidat, app-shell, etc.) — avant, ce handler
// vivait seulement dans l'app-shell, donc un clic depuis /m ou /candidat ne
// naviguait pas.
export function SwNavigationListener() {
  const router = useRouter();
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || d.type !== "NOTIF_NAVIGATE" || typeof d.url !== "string") return;
      try {
        const u = new URL(d.url, window.location.origin);
        if (u.origin !== window.location.origin) return;
        const target = u.pathname + u.search + u.hash;
        if (target !== window.location.pathname + window.location.search) {
          router.push(target);
        }
      } catch {
        /* url malformee : on ignore */
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
