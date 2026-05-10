"use client";

// Composant client de capture vidéo pour une question kind='video'.
// Flow :
//   idle → requesting_camera → ready → recording → uploading → done
//                                                    ↳ error → ready (peut retry)
// Une fois `done`, plus de re-record possible ("1 seule prise").
//
// Capture via MediaRecorder natif (codec WebM, fallback automatique).
// Upload direct vers Supabase Storage (bucket privé "pre-interview-videos")
// avec un client anon — la policy INSERT du bucket accepte les uploads sans
// auth ; la sécurité repose sur le token (path = {token}/{question_id}.webm).
//
// Fallback : si MediaRecorder / getUserMedia indisponibles (vieux Safari iOS),
// on affiche un textarea pour répondre en texte à la place.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Video as VideoIcon,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  PRE_INTERVIEW_VIDEO_BUCKET,
  type PreInterviewResponse,
} from "@/lib/pre-interview-types";
import { saveVideoResponseAction } from "./save-video";

type State =
  | "idle"
  | "requesting_camera"
  | "ready"
  | "recording"
  | "uploading"
  | "done"
  | "error"
  | "unsupported";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function pickMimeType(): string {
  // Ordre de préférence : VP9+Opus > VP8+Opus > defaut webm > defaut mp4 (Safari)
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // some browsers throw on weird inputs
    }
  }
  return "";
}

function extFor(mime: string): string {
  if (!mime) return "webm";
  if (mime.startsWith("video/mp4")) return "mp4";
  return "webm";
}

function checkSupport():
  | { ok: true; mime: string }
  | { ok: false; reason: string } {
  if (typeof window === "undefined") return { ok: false, reason: "ssr" };
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "getUserMedia indisponible" };
  }
  if (typeof MediaRecorder === "undefined") {
    return { ok: false, reason: "MediaRecorder indisponible" };
  }
  const mime = pickMimeType();
  if (!mime) return { ok: false, reason: "Aucun codec vidéo supporté" };
  return { ok: true, mime };
}

export function VideoQuestion({
  token,
  questionId,
  maxSeconds,
  initialResponse,
  onTextFallback,
}: {
  token: string;
  questionId: string;
  maxSeconds: number;
  initialResponse: PreInterviewResponse | undefined;
  /** Callback appelé quand l'utilisateur tape du texte de fallback (Safari < iOS 15). */
  onTextFallback?: (text: string) => void;
}) {
  // Support détecté côté client (et only) — on évite SSR mismatch en initialisant null
  const [support, setSupport] = useState<
    null | { ok: true; mime: string } | { ok: false; reason: string }
  >(null);

  const [state, setState] = useState<State>(() =>
    initialResponse?.video_storage_path ? "done" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number>(maxSeconds);
  const [recordedDuration, setRecordedDuration] = useState<number>(
    initialResponse?.video_duration_sec ?? 0,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string>(
    initialResponse?.answer_text ?? "",
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabase = useMemo(
    () => createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    [],
  );

  useEffect(() => {
    setSupport(checkSupport());
  }, []);

  useEffect(() => {
    if (support && !support.ok) setState("unsupported");
  }, [support]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      try {
        recorderRef.current?.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCamera() {
    setErrorMsg(null);
    setState("requesting_camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        // iOS Safari needs explicit play() after setting srcObject in some cases
        try {
          await videoRef.current.play();
        } catch {
          // ignore — user gesture will retry
        }
      }
      setState("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Caméra refusée.";
      setErrorMsg(`Impossible d'activer la caméra : ${msg}`);
      setState("error");
    }
  }

  function startRecording() {
    if (!streamRef.current || !support?.ok) return;
    chunksRef.current = [];
    const mime = support.mime;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Erreur MediaRecorder : ${msg}`);
      setState("error");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - startedAtRef.current) / 1000),
      );
      setRecordedDuration(durationSec);
      uploadAndSave(blob, durationSec, mime);
    };
    recorder.onerror = (ev) => {
      const errAny = ev as unknown as { error?: { message?: string } };
      setErrorMsg(`Erreur enregistrement : ${errAny.error?.message ?? "inconnue"}`);
      setState("error");
    };
    startedAtRef.current = Date.now();
    setRemaining(maxSeconds);
    setState("recording");
    recorder.start(250); // chunks toutes les 250ms

    // Compte à rebours
    countdownTimerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    // Stop auto à maxSeconds
    stopTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, maxSeconds * 1000);
  }

  function stopRecording() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {}
    // On stop le stream pour libérer la caméra (LED off).
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function uploadAndSave(blob: Blob, durationSec: number, mime: string) {
    setState("uploading");
    setErrorMsg(null);
    try {
      const ext = extFor(mime);
      const path = `${token}/${questionId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(PRE_INTERVIEW_VIDEO_BUCKET)
        .upload(path, blob, {
          contentType: mime || "video/webm",
          upsert: true,
        });
      if (upErr) {
        throw new Error(upErr.message);
      }
      const res = await saveVideoResponseAction({
        token,
        questionId,
        storagePath: path,
        durationSec,
      });
      if (!res.ok) {
        throw new Error(res.error);
      }
      // Génère un preview local pour relecture (pas de signed URL côté candidat).
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setState("done");
      toast.success("Vidéo enregistrée.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec d'envoi.";
      setErrorMsg(`Upload échoué : ${msg}`);
      setState("error");
      toast.error(`Vidéo non envoyée : ${msg}`);
    }
  }

  // ─────────────────────────────────────── Rendering ─────────────────────────

  if (support === null) {
    return (
      <div className="text-xs text-ink-3 italic">Vérification du navigateur…</div>
    );
  }

  if (state === "unsupported" || (support && !support.ok)) {
    return (
      <div className="space-y-2">
        <div className="bg-warn-light/40 border border-warn-light rounded-md p-3 text-xs text-warn flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <b>Ton appareil ne supporte pas l&apos;enregistrement vidéo.</b>
            <p className="mt-0.5">
              Réponds en texte ci-dessous (cela compte comme une réponse valide).
            </p>
          </div>
        </div>
        <Textarea
          rows={4}
          value={fallbackText}
          onChange={(e) => {
            setFallbackText(e.target.value);
            onTextFallback?.(e.target.value);
          }}
          placeholder="Ta réponse écrite…"
          className="text-base sm:text-sm leading-relaxed"
        />
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-success text-sm font-bold">
          <CheckCircle2 className="h-4 w-4" />
          Enregistré ({recordedDuration} sec)
        </div>
        {previewUrl ? (
          <video
            src={previewUrl}
            controls
            playsInline
            className="w-full max-w-md rounded-md border border-line bg-ink"
          />
        ) : (
          <div className="text-[11px] text-ink-3 italic">
            Vidéo bien reçue. Tu la verras de nouveau côté équipe RH.
          </div>
        )}
        <p className="text-[11px] text-ink-3">
          Une seule prise — l&apos;enregistrement ne peut pas être refait.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Preview live caméra */}
      <div className="relative bg-ink rounded-md overflow-hidden border border-line aspect-video max-w-md">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="w-full h-full object-cover"
        />
        {state === "recording" ? (
          <div className="absolute top-2 left-2 bg-danger text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            REC
          </div>
        ) : null}
        {state === "recording" ? (
          <div className="absolute top-2 right-2 bg-ink/80 text-white text-2xl font-bold px-3 py-1 rounded tabular-nums">
            {remaining}s
          </div>
        ) : null}
      </div>

      {state === "idle" || state === "error" ? (
        <div className="space-y-2">
          {errorMsg ? (
            <div className="text-xs text-danger flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {errorMsg}
            </div>
          ) : null}
          <Button
            type="button"
            variant="gold"
            onClick={requestCamera}
            className="min-h-11"
          >
            <Camera className="h-4 w-4" />
            Activer la caméra
          </Button>
          <p className="text-[11px] text-ink-3">
            Durée max : {maxSeconds} sec · 1 seule prise (pas de refaire)
          </p>
        </div>
      ) : null}

      {state === "requesting_camera" ? (
        <div className="text-xs text-ink-2 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Demande d&apos;autorisation caméra…
        </div>
      ) : null}

      {state === "ready" ? (
        <Button
          type="button"
          variant="danger"
          onClick={startRecording}
          className="min-h-11"
        >
          <VideoIcon className="h-4 w-4" />
          Commencer l&apos;enregistrement ({maxSeconds} sec)
        </Button>
      ) : null}

      {state === "recording" ? (
        <Button
          type="button"
          variant="outline"
          onClick={stopRecording}
          className="min-h-11"
        >
          <Square className="h-4 w-4" />
          Arrêter maintenant
        </Button>
      ) : null}

      {state === "uploading" ? (
        <div className="text-xs text-ink-2 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Envoi de la vidéo… (ne ferme pas la page)
        </div>
      ) : null}
    </div>
  );
}
