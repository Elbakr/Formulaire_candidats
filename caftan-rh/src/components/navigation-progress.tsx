"use client";

// Karim 2026-07-07 : BARRE DE PROGRESSION GLOBALE de navigation (anti triple-clic).
//
// Objectif : dès qu'un clic déclenche un chargement de page (clic sur un <Link>,
// router.push, back/forward), une fine barre dorée apparaît EN HAUT de l'écran et
// disparaît quand la nouvelle page est prête. L'opérateur voit que « ça travaille »
// et ne clique pas 3 fois.
//
// Next.js 16 (App Router) n'expose PAS d'évènements de router globaux. `useLinkStatus`
// (next/link) ne donne le pending QUE pour un <Link> descendant précis — inutilisable
// pour une barre globale. On combine donc :
//   - DÉBUT : interception (capture) des clics sur les <a> internes + patch de
//     history.pushState/replaceState (couvre router.push/replace) + popstate (back/fwd).
//   - FIN  : changement de usePathname()/useSearchParams() = la route a commité.
// Réf. doc locale : node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
//   use-link-status.md et .../01-getting-started/04-linking-and-navigating.md
//   (« You might not need useLinkStatus » + note « progress bar » react-transition-progress).
//
// Perf : état 100% local à ce composant, aucun re-render du reste de l'app.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GOLD = "#c9a227";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(0);
  const [visible, setVisible] = useState(false);

  const activeRef = useRef(false);
  const trickleRef = useRef<number | null>(null);
  const doneRef = useRef<number | null>(null);
  const safetyRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (trickleRef.current != null) {
      window.clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (doneRef.current != null) {
      window.clearTimeout(doneRef.current);
      doneRef.current = null;
    }
    if (safetyRef.current != null) {
      window.clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
  }, []);

  const done = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setValue(100);
    doneRef.current = window.setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, 250);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    setVisible(true);
    setValue(8);
    // Progression « trickle » qui plafonne à 90 % en attendant le commit de route.
    trickleRef.current = window.setInterval(() => {
      setValue((v) => {
        if (v >= 90) return v;
        const inc = v < 40 ? 7 : v < 70 ? 3 : 1;
        return Math.min(90, v + inc);
      });
    }, 300);
    // Filet de sécurité : navigation annulée / échouée -> on ne reste pas bloqué.
    safetyRef.current = window.setTimeout(() => done(), 10000);
  }, [clearTimers, done]);

  // FIN : la route (pathname + query) a changé => la nouvelle page est prête.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // DÉBUT : clics <a> internes + patch history + popstate.
  useEffect(() => {
    const isInternalNav = (anchor: HTMLAnchorElement): boolean => {
      const target = anchor.target;
      if (target && target !== "_self") return false;
      if (anchor.hasAttribute("download")) return false;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
        return false;
      }
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return false;
      }
      if (url.origin !== window.location.origin) return false;
      // Même URL (pathname + query) => pas de navigation réelle.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return false;
      }
      return true;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (isInternalNav(anchor)) start();
    };

    const onPopState = () => start();

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);

    // Patch pushState/replaceState : couvre router.push()/replace() (pas d'<a>).
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
      const ret = origPush.apply(this, args);
      start();
      return ret;
    };
    window.history.replaceState = function (
      this: History,
      ...args: Parameters<History["replaceState"]>
    ) {
      const ret = origReplace.apply(this, args);
      start();
      return ret;
    };

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 2147483000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: GOLD,
          boxShadow: `0 0 8px ${GOLD}, 0 0 4px ${GOLD}`,
          borderTopRightRadius: 2,
          borderBottomRightRadius: 2,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

/**
 * Barre de progression globale de navigation. Montée une fois dans le layout racine.
 * Wrappée dans <Suspense> car useSearchParams() l'exige (sinon deopt CSR de la page).
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
