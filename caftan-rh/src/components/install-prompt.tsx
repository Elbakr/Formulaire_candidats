"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "cf_install_dismissed_at";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    navStandalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  // iPhone, iPad, iPod, and iPadOS reporting as Mac with touch
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  );
}

export function InstallPrompt() {
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (isStandalone() || recentlyDismissed()) {
      setHidden(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari fallback (no beforeinstallprompt support).
    if (isIOS() && !isStandalone()) {
      setShowIos(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        dismiss();
      }
    } catch {}
    setDeferredPrompt(null);
  }

  if (!mounted || hidden) return null;

  // Chrome / Android — interactive install prompt.
  if (deferredPrompt) {
    return (
      <div
        role="dialog"
        aria-label="Installer CaftanRH"
        className="fixed bottom-3 right-3 left-3 sm:left-auto sm:max-w-sm z-20 rounded-xl border border-line bg-surface shadow-lg p-3 flex items-center gap-3"
      >
        <div className="h-9 w-9 shrink-0 rounded-md bg-ink flex items-center justify-center">
          <Download className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-tight">Installer CaftanRH</div>
          <div className="text-[11px] text-ink-2 leading-tight">
            Sur ton écran d'accueil, comme une vraie app.
          </div>
        </div>
        <button
          onClick={install}
          className="shrink-0 rounded-md bg-gold text-white text-xs font-bold px-3 py-2 hover:bg-gold-dark transition-colors"
        >
          Installer
        </button>
        <button
          onClick={dismiss}
          aria-label="Plus tard"
          className="shrink-0 rounded-md p-1.5 text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // iOS Safari — static instructions (cannot trigger install programmatically).
  if (showIos) {
    return (
      <div
        role="dialog"
        aria-label="Installer CaftanRH sur iOS"
        className="fixed bottom-3 right-3 left-3 sm:left-auto sm:max-w-sm z-20 rounded-xl border border-line bg-surface shadow-lg p-3 flex items-center gap-3"
      >
        <div className="h-9 w-9 shrink-0 rounded-md bg-ink flex items-center justify-center">
          <Share className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-tight">Installer CaftanRH</div>
          <div className="text-[11px] text-ink-2 leading-tight">
            Appuie sur Partager puis « Sur l'écran d'accueil ».
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Plus tard"
          className="shrink-0 rounded-md p-1.5 text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
