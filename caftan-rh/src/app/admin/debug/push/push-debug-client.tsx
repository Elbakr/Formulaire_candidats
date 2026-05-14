"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sendTestPushToSelfAction } from "./test-actions";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(b64) : "";
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export function PushDebugClient({ publicKey }: { publicKey: string | null }) {
  const [info, setInfo] = useState<{
    swSupported: boolean;
    pushSupported: boolean;
    notifSupported: boolean;
    permission: NotificationPermission | "unknown";
    isStandalone: boolean;
    isIos: boolean;
    swRegistered: boolean;
    swScope: string | null;
    swState: string | null;
    subscribed: boolean;
    subEndpoint: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Trace visible dans l'UI (utile iPhone PWA -- impossible d'ouvrir la console).
  // Persistee en localStorage : si l'utilisateur quitte la page apres avoir
  // accorde la permission iOS, il peut revenir et voir ce qui s'est passe.
  const TRACE_KEY = "caftanrh-push-trace-v1";
  const [trace, setTrace] = useState<string[]>([]);
  const traceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(TRACE_KEY);
      if (stored) setTrace(JSON.parse(stored) as string[]);
    } catch {
      /* noop */
    }
  }, []);
  function persistTrace(lines: string[]) {
    try {
      window.localStorage.setItem(TRACE_KEY, JSON.stringify(lines.slice(-200)));
    } catch {
      /* noop */
    }
  }
  function logTrace(line: string) {
    const ts = new Date().toLocaleTimeString("fr-BE", { hour12: false });
    setTrace((t) => {
      const next = [...t, `${ts} ${line}`];
      persistTrace(next);
      return next;
    });
    console.log("[push-debug]", line);
    setTimeout(() => traceRef.current?.scrollIntoView({ block: "end" }), 50);
  }
  function clearTrace() {
    setTrace([]);
    try {
      window.localStorage.removeItem(TRACE_KEY);
    } catch {
      /* noop */
    }
  }

  async function probe() {
    if (typeof window === "undefined") return;
    const swSupported = "serviceWorker" in navigator;
    const pushSupported = "PushManager" in window;
    const notifSupported = "Notification" in window;
    const permission = notifSupported ? Notification.permission : ("unknown" as const);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) &&
        "ontouchend" in document &&
        navigator.maxTouchPoints > 1);

    let swRegistered = false;
    let swScope: string | null = null;
    let swState: string | null = null;
    let subscribed = false;
    let subEndpoint: string | null = null;
    if (swSupported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          swRegistered = true;
          swScope = reg.scope;
          swState = reg.active?.state ?? reg.installing?.state ?? reg.waiting?.state ?? null;
          if (pushSupported) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              subscribed = true;
              subEndpoint = sub.endpoint;
            }
          }
        }
      } catch {
        /* noop */
      }
    }
    setInfo({
      swSupported,
      pushSupported,
      notifSupported,
      permission,
      isStandalone,
      isIos,
      swRegistered,
      swScope,
      swState,
      subscribed,
      subEndpoint,
    });
  }

  useEffect(() => {
    probe();
  }, []);

  async function activate() {
    if (!publicKey) {
      toast.error("VAPID public key absente côté serveur.");
      return;
    }
    setBusy(true);
    clearTrace();
    logTrace("▶ start");
    // Pas de watchdog tant que l'user n'a pas repondu a la popup iOS Notifications
    // (peut prendre plusieurs minutes). On le demarre apres step 1.
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    try {
      logTrace("step 1/4 -- demande permission notifications (clique 'Autoriser' dans la popup iOS)");
      const perm = await Notification.requestPermission();
      logTrace(`step 1/4 OK -- permission = ${perm}`);
      if (perm !== "granted") {
        toast.error(`Permission refusée (${perm}). Va dans Réglages iPhone > Notifications > CaftanRH.`);
        return;
      }
      // Watchdog pour les etapes techniques (60s, plus genereux)
      watchdog = setTimeout(() => {
        logTrace("✗ TIMEOUT 60s -- l'etape ci-dessus n'a pas repondu");
        setBusy(false);
        toast.error("Activation trop longue (60s).");
      }, 60_000);
      logTrace("step 2/4 -- attend service worker pret");
      // Wrap avec timeout dedie 15s
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, rej) =>
          setTimeout(() => rej(new Error("SW.ready timeout 15s")), 15_000),
        ),
      ]);
      logTrace(`step 2/4 OK -- SW scope=${reg.scope}, state=${reg.active?.state ?? "?"}`);
      logTrace("step 3a/4 -- check existing subscription");
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        logTrace(`step 3/4 OK -- subscription existante (${sub.endpoint.slice(0, 60)}...)`);
      } else {
        logTrace("step 3b/4 -- appel pushManager.subscribe (Apple APNs)");
        // Timeout 30s sur subscribe (le plus risque sur iOS PWA + tunnel)
        sub = await Promise.race([
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToBuffer(publicKey),
          }),
          new Promise<PushSubscription>((_, rej) =>
            setTimeout(() => rej(new Error("APNs subscribe timeout 30s -- Apple a probablement bloque le tunnel")), 30_000),
          ),
        ]);
        logTrace(`step 3/4 OK -- nouvelle subscription cree`);
      }
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      logTrace("step 4/4 -- POST /api/push/subscribe");
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      logTrace(`step 4/4 -- HTTP ${res.status}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      logTrace("✓ abonnement enregistre en DB");
      toast.success("Abonnement enregistré 🎉");
      await probe();
    } catch (err) {
      logTrace(`✗ ERREUR : ${(err as Error).message}`);
      toast.error(`Activation échouée : ${(err as Error).message}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setBusy(false);
    }
  }

  async function sendTestPush() {
    setBusy(true);
    try {
      const r = await sendTestPushToSelfAction();
      if (r.error) {
        toast.error(r.error);
      } else {
        toast.success(
          `Push envoyé : ${r.sent}/${r.active_subs} subscriptions. Vérifie ton iPhone (notif lock screen).`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function unregisterSw() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.unregister();
        toast.success("Service Worker désenregistré. Recharge la page.");
      } else {
        toast.info("Aucun SW à désenregistrer.");
      }
      await probe();
    } catch (err) {
      toast.error(`Erreur : ${(err as Error).message}`);
    }
  }

  if (!info) {
    return (
      <Card>
        <div className="p-4 text-sm text-ink-3">Détection en cours...</div>
      </Card>
    );
  }

  const StatusRow = ({ label, ok, value }: { label: string; ok: boolean; value?: string }) => (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="h-3.5 w-3.5 text-success shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-warn shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      {value ? <span className="font-mono text-[11px] text-ink-3">{value}</span> : null}
    </li>
  );

  return (
    <Card>
      <div className="p-4 space-y-3">
        <h2 className="font-bold">Côté navigateur (ce device)</h2>
        <ul className="text-sm space-y-1">
          <StatusRow label="Service Worker supporté" ok={info.swSupported} />
          <StatusRow label="Push API supportée" ok={info.pushSupported} />
          <StatusRow label="Notification API supportée" ok={info.notifSupported} />
          <StatusRow
            label="Permission notifications"
            ok={info.permission === "granted"}
            value={info.permission}
          />
          <StatusRow
            label="App installée comme PWA (standalone)"
            ok={info.isStandalone}
            value={info.isStandalone ? "oui" : "non"}
          />
          {info.isIos ? (
            <StatusRow
              label="iOS détecté"
              ok={info.isStandalone}
              value={info.isStandalone ? "PWA OK" : "PWA REQUISE pour push iOS"}
            />
          ) : null}
          <StatusRow
            label="Service Worker enregistré"
            ok={info.swRegistered}
            value={info.swState ?? undefined}
          />
          <StatusRow
            label="Abonné push (ce navigateur)"
            ok={info.subscribed}
            value={info.subscribed ? "oui" : "non"}
          />
        </ul>

        {info.isIos && !info.isStandalone ? (
          <div className="rounded-md border border-warn bg-warn-light/40 p-3 text-xs">
            <div className="font-bold mb-1">⚠ iOS exige PWA installée pour les push</div>
            <ol className="ml-3 list-decimal space-y-0.5">
              <li>Appuie sur l'icône Partager en bas de Safari</li>
              <li>Choisis « Sur l'écran d'accueil »</li>
              <li>Rouvre l'app depuis l'icône, reviens sur cette page, clique Activer</li>
            </ol>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!info.subscribed ? (
            <Button
              onClick={() => {
                if (info.isIos && !info.isStandalone) {
                  toast.error("Installe d'abord l'app en PWA (Partager > Sur l'écran d'accueil), puis rouvre depuis l'icône.");
                  return;
                }
                if (!info.pushSupported || !info.notifSupported) {
                  toast.error("Ton navigateur ne supporte pas les push notifications. Essaie Chrome/Edge/Safari à jour.");
                  return;
                }
                activate();
              }}
              disabled={busy}
              variant="gold"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Bell className="h-4 w-4 mr-1" />
              )}
              Activer maintenant
            </Button>
          ) : null}
          {info.subscribed ? (
            <Button onClick={sendTestPush} variant="gold" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              M'envoyer un push test
            </Button>
          ) : null}
          <Button onClick={probe} variant="outline" size="sm">
            Rafraîchir le diagnostic
          </Button>
          {info.swRegistered ? (
            <Button onClick={unregisterSw} variant="outline" size="sm">
              Désenregistrer le SW (force refresh)
            </Button>
          ) : null}
        </div>

        {trace.length > 0 ? (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                Trace activation (visible iPhone, persistee)
              </div>
              <button
                type="button"
                onClick={clearTrace}
                className="text-[10px] text-ink-3 hover:text-ink underline"
              >
                vider
              </button>
            </div>
            <div className="rounded bg-ink text-success font-mono text-[11px] p-2 max-h-48 overflow-auto">
              {trace.map((line, i) => (
                <div key={i} className={line.includes("✗") ? "text-danger" : line.includes("✓") ? "text-success" : "text-white/80"}>
                  {line}
                </div>
              ))}
              <div ref={traceRef} />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
