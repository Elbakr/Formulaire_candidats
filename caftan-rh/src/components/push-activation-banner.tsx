"use client";

import { useEffect, useState } from "react";
import { Bell, X, Share, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Banniere d'activation des notifications affichee proactivement quand :
 *  - publicKey VAPID est configure ;
 *  - l'utilisateur n'a pas encore active les push (ni refuse) ;
 *  - l'utilisateur n'a pas dismiss la banniere dans les 24h.
 *
 * Sur iOS hors PWA : affiche le guide d'installation PWA en priorite (les
 * push Web ne marchent QUE depuis l'app installee sur ecran d'accueil).
 *
 * Stockage du dismiss en localStorage. Reapparait apres 24h.
 */
const DISMISS_KEY = "push_banner_dismissed_at";
const DISMISS_HOURS = 24;

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(b64) : "";
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iosUa = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    /Macintosh/.test(ua) && "ontouchend" in document && navigator.maxTouchPoints > 1;
  return iosUa || iPadOs;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mqStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!(mqStandalone || iosStandalone);
}

export function PushActivationBanner({ publicKey }: { publicKey: string | null }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"activate" | "ios-pwa" | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    // dismiss dans les dernieres 24h ?
    if (typeof localStorage !== "undefined") {
      const ts = localStorage.getItem(DISMISS_KEY);
      if (ts && Date.now() - Number(ts) < DISMISS_HOURS * 3_600_000) return;
    }

    async function detect() {
      const pushOk =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!pushOk) {
        // iOS hors PWA : guide d'install
        if (isIos() && !isStandalone()) {
          setMode("ios-pwa");
          setVisible(true);
        }
        return;
      }

      if (Notification.permission === "denied") return;
      if (Notification.permission === "granted") {
        // verifie qu'une subscription existe deja
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (existing) return; // deja subscribed, rien a montrer
        } catch {
          return;
        }
      }
      setMode("activate");
      setVisible(true);
    }
    detect();
  }, [publicKey]);

  function dismiss() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
  }

  async function activate() {
    if (working || !publicKey) return;
    setWorking(true);
    // Timeout global pour ne pas hang indefiniment (iOS Safari Push peut
    // ne pas resoudre certaines promesses si conditions non remplies).
    const watchdog = setTimeout(() => {
      console.warn("[push] activation timeout 30s, forcage state");
      setWorking(false);
      toast.error("Activation trop longue (30s). Va sur /admin/debug/push pour diagnostiquer.");
    }, 30_000);
    try {
      console.log("[push] step 1 -- requestPermission");
      const perm = await Notification.requestPermission();
      console.log("[push] permission =", perm);
      if (perm !== "granted") {
        toast.error(`Permission refusée (${perm}). Va dans réglages du navigateur pour réactiver.`);
        return;
      }
      console.log("[push] step 2 -- serviceWorker.ready");
      const reg = await navigator.serviceWorker.ready;
      console.log("[push] SW ready, scope=", reg.scope);
      console.log("[push] step 3 -- getSubscription");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        console.log("[push] step 3b -- pushManager.subscribe");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(publicKey),
        });
      }
      console.log("[push] step 4 -- POST /api/push/subscribe");
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Échec serveur HTTP ${res.status} ${errBody.slice(0, 100)}`);
      }
      toast.success("Notifications activées 🎉");
      setVisible(false);
    } catch (err) {
      console.error("[push] activation error:", err);
      toast.error(`Activation échouée : ${(err as Error).message}`);
    } finally {
      clearTimeout(watchdog);
      setWorking(false);
    }
  }

  if (!visible) return null;

  if (mode === "ios-pwa") {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 p-3 pb-safe sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md"
        role="dialog"
        aria-label="Installer l'app pour les notifications"
      >
        <div className="rounded-lg border border-gold bg-surface shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Active les notifs sur iPhone</div>
              <p className="text-xs text-ink-2 mt-1">
                iOS exige d'abord d'installer l'app :
              </p>
              <ol className="text-xs text-ink-2 mt-1 space-y-0.5 ml-3 list-decimal">
                <li>
                  Appuie sur{" "}
                  <Share className="inline h-3.5 w-3.5 align-text-bottom" /> (Partager) en bas
                </li>
                <li>« Sur l'écran d'accueil »</li>
                <li>Rouvre l'app depuis l'icône</li>
              </ol>
            </div>
            <button
              onClick={dismiss}
              className="text-ink-3 hover:text-ink-2 shrink-0"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 p-3 pb-safe sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md"
      role="dialog"
      aria-label="Activer les notifications"
    >
      <div className="rounded-lg border border-gold bg-surface shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Active les notifications</div>
            <p className="text-xs text-ink-2 mt-1">
              Renforts, absences à couvrir, jours spéciaux à venir, anomalies Dimona — reçois tout en temps réel.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="gold"
                onClick={activate}
                disabled={working}
              >
                {working ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Bell className="h-4 w-4 mr-1" />
                )}
                Activer
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Plus tard
              </Button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-ink-3 hover:text-ink-2 shrink-0"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
