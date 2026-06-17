"use client";

// Karim 2026-06-17 : caméra in-app avec CADRE DE VISÉE en forme de carte
// d'identité (ratio ISO 85,6 x 54 mm ≈ 1,585). L'opérateur aligne la carte dans
// le cadre ; à la capture, on RECADRE exactement sur le cadre (la carte, pas les
// alentours). Repli galerie si la caméra n'est pas disponible (permission, HTTP…).

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, ImageUp } from "lucide-react";

const CARD_RATIO = 1.585; // largeur / hauteur
const FRAME_FRAC = 0.92; // le cadre occupe 92% de la dimension limitante

export function IdCardCamera({
  label,
  onCapture,
  onClose,
}: {
  label: string;
  onCapture: (jpegDataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Cadre affiché : plus grand rectangle ratio carte tenant dans 92% de la vidéo.
  const recompute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const cw = v.clientWidth;
    const ch = v.clientHeight;
    if (!cw || !ch) return;
    let w = cw * FRAME_FRAC;
    let h = w / CARD_RATIO;
    if (h > ch * FRAME_FRAC) {
      h = ch * FRAME_FRAC;
      w = h * CARD_RATIO;
    }
    setFrame({ w, h });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
          recompute();
        }
      } catch {
        setError("Caméra indisponible. Choisis une photo depuis ta galerie.");
      }
    })();
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [recompute]);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;
    // Même logique que le cadre affiché, mais en pixels intrinsèques -> recadrage fidèle.
    let cropW = vw * FRAME_FRAC;
    let cropH = cropW / CARD_RATIO;
    if (cropH > vh * FRAME_FRAC) {
      cropH = vh * FRAME_FRAC;
      cropW = cropH * CARD_RATIO;
    }
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;
    const scale = Math.min(1, 1400 / cropW);
    const outW = Math.round(cropW * scale);
    const outH = Math.round(cropH * scale);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  }

  function onFile(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => onCapture(r.result as string);
    r.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-3 py-3 text-white">
        <span className="text-sm font-semibold">Photographier : {label}</span>
        <button type="button" onClick={onClose} aria-label="Fermer" className="p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="space-y-3 p-6 text-center text-white">
            <p className="text-sm">{error}</p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
              <ImageUp className="h-4 w-4" /> Choisir une photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedMetadata={recompute}
              className="block max-h-full max-w-full"
            />
            {frame.w > 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  style={{
                    width: frame.w,
                    height: frame.h,
                    border: "2px solid #ffffff",
                    borderRadius: 10,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                  }}
                />
                <span className="absolute top-3 text-xs font-medium text-white/90">
                  Aligne la carte dans le cadre et remplis-le
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!error ? (
        <div className="flex items-center justify-between px-8 py-5">
          <label className="flex cursor-pointer flex-col items-center gap-1 text-[11px] text-white/80">
            <ImageUp className="h-5 w-5" />
            Galerie
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            aria-label="Capturer"
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/40 bg-white disabled:opacity-50"
          >
            <Camera className="h-6 w-6 text-black" />
          </button>
          <span className="w-9" />
        </div>
      ) : null}
    </div>
  );
}
