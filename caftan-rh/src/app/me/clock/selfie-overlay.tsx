"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, ShieldAlert, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { t, type Locale } from "@/lib/i18n";

/**
 * Result of a selfie capture flow.
 * - "ok": photo captured & uploaded, `storagePath` is the bucket path
 * - "no_api": getUserMedia is missing (old browser) → caller may fallback
 *   to "pointage sans photo" with anomaly flag
 * - "denied": user/system refused camera → caller must NOT proceed
 * - "cancelled": user dismissed the overlay before capture
 * - "error": any other failure (canvas, upload…)
 */
export type SelfieResult =
  | { kind: "ok"; storagePath: string }
  | { kind: "no_api"; reason: string }
  | { kind: "denied"; reason: string }
  | { kind: "cancelled" }
  | { kind: "error"; reason: string };

type Props = {
  /** ouvert => l'overlay s'affiche et la caméra démarre */
  open: boolean;
  /** auth.uid pour le chemin Storage `clock-selfies/{userId}/{ts}.jpg` */
  userId: string;
  /** Appelé quand l'overlay se ferme (capturé / annulé / erreur). */
  onResult: (r: SelfieResult) => void;
  /** Locale FR/NL. */
  locale?: Locale;
  /** Durée du compte à rebours (default 3s). */
  countdownSec?: number;
};

/**
 * Overlay plein écran qui :
 *   1. Active la caméra frontale et affiche le live stream en miroir
 *   2. Décompte 3-2-1 puis flash blanc 100ms
 *   3. Capture la frame → JPEG ≤800×800 q=0.7 → upload Storage
 *   4. Affiche l'aperçu + ✅ "Pointage enregistré" 1s
 *   5. Si permission denied : message d'aide explicite, pas de retry auto
 *   6. Si getUserMedia indispo : on remonte `no_api` (le caller fallback)
 *
 * Hooks lifecycle : on (re)met le stream à chaque (open=true). Au démontage
 * ou à la fermeture on coupe systématiquement les MediaStreamTracks.
 */
export function SelfieOverlay({
  open,
  userId,
  onResult,
  locale = "fr",
  countdownSec = 3,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<
    | { kind: "starting" }
    | { kind: "countdown"; n: number }
    | { kind: "flash" }
    | { kind: "uploading" }
    | { kind: "done"; previewDataUrl: string }
    | { kind: "denied"; reason: string }
    | { kind: "error"; reason: string }
  >({ kind: "starting" });

  // Mémorise pour éviter de re-fire onResult après unmount.
  const resolvedRef = useRef(false);
  function resolve(r: SelfieResult) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    stopStream();
    onResult(r);
  }

  function stopStream() {
    const s = streamRef.current;
    if (s) {
      try {
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
      streamRef.current = null;
    }
  }

  // Init caméra à l'ouverture, cleanup à la fermeture.
  useEffect(() => {
    if (!open) return;
    resolvedRef.current = false;
    setPhase({ kind: "starting" });

    let cancelled = false;
    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        resolve({
          kind: "no_api",
          reason: "getUserMedia non supporté sur ce navigateur",
        });
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 800 },
            height: { ideal: 800 },
          },
          audio: false,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "permission denied";
        // NotAllowedError / PermissionDeniedError → l'utilisateur a refusé.
        // SecurityError → contexte non-HTTPS. NotFoundError → pas de caméra.
        const name = (e as Error).name ?? "";
        if (cancelled) return;
        if (/NotFound|Overconstrained/i.test(name)) {
          resolve({
            kind: "no_api",
            reason: `Caméra introuvable: ${msg}`,
          });
          return;
        }
        setPhase({ kind: "denied", reason: msg });
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        /* iOS Safari peut throw NotAllowedError si pas de geste user — on a
           déjà un geste car l'overlay s'ouvre suite au tap du bouton */
      }
      // Laisse 250ms à la caméra pour exposer correctement.
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;

      // Démarrage du compte à rebours.
      runCountdown(countdownSec);
    }
    start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countdownSec]);

  async function runCountdown(from: number) {
    for (let n = from; n >= 1; n--) {
      setPhase({ kind: "countdown", n });
      await new Promise((r) => setTimeout(r, 1000));
      if (resolvedRef.current) return;
    }
    setPhase({ kind: "flash" });
    await new Promise((r) => setTimeout(r, 100));
    if (resolvedRef.current) return;
    await captureAndUpload();
  }

  async function captureAndUpload() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      resolve({ kind: "error", reason: "stream perdu" });
      return;
    }
    setPhase({ kind: "uploading" });

    try {
      const w = Math.min(800, video.videoWidth || 640);
      const h = Math.min(800, video.videoHeight || 480);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2D context indisponible");
      ctx.drawImage(video, 0, 0, w, h);

      const blob: Blob = await new Promise((resolveBlob, reject) => {
        canvas.toBlob(
          (b) => (b ? resolveBlob(b) : reject(new Error("canvas.toBlob a échoué"))),
          "image/jpeg",
          0.7,
        );
      });
      const previewDataUrl = canvas.toDataURL("image/jpeg", 0.6);

      const supabase = createClient();
      const path = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("clock-selfies")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(`upload Storage: ${error.message}`);

      // Aperçu visible 1 seconde avant de remonter le résultat — rassure
      // l'utilisateur ("c'est bien parti").
      setPhase({ kind: "done", previewDataUrl });
      // On coupe la caméra dès maintenant (économie batterie iOS).
      stopStream();
      await new Promise((r) => setTimeout(r, 1000));
      resolve({ kind: "ok", storagePath: path });
    } catch (e) {
      const reason = (e as Error).message ?? "capture failed";
      setPhase({ kind: "error", reason });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("clock.selfie_overlay_title", locale)}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center px-4 py-6 select-none"
    >
      {/* Header : titre + close */}
      <div className="w-full max-w-sm flex items-center justify-between mb-6 text-white">
        <div className="flex items-center gap-2 font-bold">
          <Camera className="h-5 w-5" />
          <span>{t("clock.selfie_overlay_title", locale)}</span>
        </div>
        <button
          type="button"
          onClick={() => resolve({ kind: "cancelled" })}
          aria-label={t("clock.selfie_overlay_cancel", locale)}
          className="text-white/80 hover:text-white p-2 -m-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Zone vidéo / aperçu / erreur */}
      <div className="relative w-[80vw] max-w-[320px] aspect-square">
        {/* Cercle de cadrage */}
        <div className="absolute inset-0 rounded-full overflow-hidden ring-4 ring-white/30 shadow-[var(--shadow-lg)]">
          {phase.kind === "done" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={phase.previewDataUrl}
              alt="Selfie capturé"
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : phase.kind === "denied" || phase.kind === "error" ? (
            <div className="w-full h-full bg-danger/30 flex items-center justify-center">
              <ShieldAlert className="h-12 w-12 text-white" />
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover scale-x-[-1]"
            />
          )}
        </div>

        {/* Overlays selon phase */}
        {phase.kind === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/80 text-sm bg-black/40 rounded px-3 py-1.5">
              {t("clock.selfie_overlay_starting", locale)}
            </span>
          </div>
        ) : null}
        {phase.kind === "countdown" ? (
          // Karim 2026-05-13 : countdown discret, en haut a droite, petit.
          // Plus de chiffre geant centre + plus de cercle de flash.
          <div className="absolute top-3 right-3 pointer-events-none">
            <span
              key={phase.n}
              className="text-white/90 text-sm font-mono font-bold bg-black/40 rounded px-2 py-0.5"
            >
              {phase.n}
            </span>
          </div>
        ) : null}
        {phase.kind === "flash" ? (
          // Flash subtil : bordure blanche brève au lieu de remplir tout l'écran
          <div className="absolute inset-0 ring-2 ring-white/80 rounded" />
        ) : null}
        {phase.kind === "done" ? (
          <div className="absolute inset-x-0 -bottom-2 flex justify-center">
            <span className="inline-flex items-center gap-1.5 bg-success text-white text-sm font-bold rounded-full px-3 py-1.5 shadow-lg">
              <Check className="h-4 w-4" />
              {t("clock.selfie_overlay_captured", locale)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Hint sous le cercle */}
      <div className="mt-8 text-white/80 text-sm text-center max-w-sm">
        {phase.kind === "countdown" ? (
          <span>{t("clock.selfie_overlay_hint", locale)}</span>
        ) : phase.kind === "uploading" ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Envoi de la photo…
          </span>
        ) : phase.kind === "denied" ? (
          <div className="space-y-2">
            <div className="font-bold text-white">
              {t("clock.selfie_overlay_denied_title", locale)}
            </div>
            <div>{t("clock.selfie_overlay_denied_body", locale)}</div>
            <a
              href="https://support.apple.com/fr-be/guide/iphone/iph168c4bbd5/ios"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 underline text-white/90"
            >
              {t("clock.selfie_overlay_help_ios", locale)}
            </a>
            <div className="pt-3">
              <button
                type="button"
                onClick={() =>
                  resolve({
                    kind: "denied",
                    reason: phase.reason,
                  })
                }
                className="rounded-md bg-white text-ink px-4 py-2 text-sm font-bold"
              >
                OK
              </button>
            </div>
          </div>
        ) : phase.kind === "error" ? (
          <div className="space-y-3">
            <div className="text-white">{phase.reason}</div>
            <button
              type="button"
              onClick={() =>
                resolve({ kind: "error", reason: phase.reason })
              }
              className="rounded-md bg-white text-ink px-4 py-2 text-sm font-bold"
            >
              OK
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
