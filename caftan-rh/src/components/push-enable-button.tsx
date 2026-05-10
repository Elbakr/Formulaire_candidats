"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  /**
   * Clé publique VAPID (Uint8Array encodée base64 url-safe).
   * Si null, on cache le bouton.
   */
  publicKey: string | null;
  /** Variante d'affichage. */
  compact?: boolean;
};

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(b64) : "";
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

/**
 * CTA d'activation des notifications push PWA.
 *  - Si push API non supportée → cache le bouton (silencieux).
 *  - Si déjà subscribed → "Activées ✓".
 *  - Sinon → demande permission + souscrit + POST /api/push/subscribe.
 */
export function PushEnableButton({ publicKey, compact }: Props) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return;
      }
      setSupported(true);
      setPermission(Notification.permission);
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      } catch {
        // ignore
      }
    }
    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported || !publicKey) return null;

  async function activate() {
    if (working) return;
    setWorking(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Permission refusée. Active les notifications dans les réglages du navigateur.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(publicKey!),
        });
      }
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
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Échec serveur");
      }
      setSubscribed(true);
      toast.success("Notifications activées. On t'écrit pour les renforts et absences.");
    } catch (err) {
      console.error(err);
      toast.error("Activation échouée. Réessaie.");
    } finally {
      setWorking(false);
    }
  }

  if (subscribed && permission === "granted") {
    return (
      <div
        className={
          compact
            ? "inline-flex items-center gap-1.5 text-xs font-bold text-success"
            : "inline-flex items-center gap-2 text-sm font-bold text-success"
        }
      >
        <Bell className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        Notifications activées
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div
        className={
          compact
            ? "inline-flex items-center gap-1.5 text-xs text-ink-3"
            : "inline-flex items-center gap-2 text-sm text-ink-3"
        }
      >
        <BellOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        Notifications bloquées dans le navigateur.
      </div>
    );
  }

  return (
    <Button
      variant="gold"
      size={compact ? "sm" : "default"}
      onClick={activate}
      disabled={working}
    >
      {working ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      Activer les notifications
    </Button>
  );
}
