"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, MapPin, ChevronDown, Camera } from "lucide-react";
import { toast } from "sonner";
import { clockInAction, clockOutAction } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { t, dateLocaleStr, type Locale } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  light_color: string | null;
  is_primary: boolean;
};

type Props = {
  isClockedIn: boolean;
  /** ISO du clock-in en cours, si applicable. */
  clockInAt: string | null;
  defaultSite: Site | null;
  availableSites: Site[];
  /** Heures planifiées du shift d'aujourd'hui ("HH:MM"–"HH:MM"). */
  todayShift: { start: string; end: string } | null;
  /** Toggle org : géoloc strictement bloquante au clock-in (défaut true). */
  geofenceStrict: boolean;
  /** Toggle org : photo selfie obligatoire au clock-in (défaut true). */
  selfieRequired: boolean;
  /** UUID du user courant (auth.uid) — utilisé pour le path Storage. */
  userId: string;
  /** Locale FR/NL pour les libellés (par défaut FR). */
  locale?: Locale;
};

type Geo = { lat: number; lng: number; accuracy?: number };

/**
 * Récupère la géoloc en bloquant si `strict=true`. En non-strict on garde
 * un timeout court (3s) pour ne pas freezer l'UI quand la géoloc lambine.
 */
function tryGeo(strict: boolean): Promise<Geo | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const timeoutMs = strict ? 15000 : 3000;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(null);
      },
      {
        enableHighAccuracy: strict,
        maximumAge: strict ? 0 : 60_000,
        timeout: timeoutMs,
      },
    );
  });
}

function formatElapsed(start: Date, now: Date, locale: Locale): string {
  const diffMin = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const hSuffix = locale === "nl" ? "u" : "h";
  if (h === 0) return `${m} min`;
  return `${h}${hSuffix}${m.toString().padStart(2, "0")}`;
}

/**
 * Capture un selfie via getUserMedia : ouvre une vidéo cachée, snap la 1re
 * frame stable, downscale en JPEG ≤ 800x800 (qualité 0.7), upload Storage.
 * Renvoie le path Storage ou throw une erreur explicative.
 */
async function captureAndUploadSelfie(userId: string): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia non supporté sur ce navigateur");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 800 }, height: { ideal: 800 } },
      audio: false,
    });
  } catch (e) {
    throw new Error(
      `Caméra refusée ou indisponible: ${(e as Error).message ?? "permission denied"}`,
    );
  }

  try {
    // On laisse 200ms à la caméra pour exposer correctement.
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 250));

    const w = Math.min(800, video.videoWidth || 640);
    const h = Math.min(800, video.videoHeight || 480);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context indisponible");
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob a échoué"))),
        "image/jpeg",
        0.7,
      );
    });

    const supabase = createClient();
    const path = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("clock-selfies")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`upload Storage: ${error.message}`);
    return path;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export function ClockBigButton({
  isClockedIn,
  clockInAt,
  defaultSite,
  availableSites,
  todayShift,
  geofenceStrict,
  selfieRequired,
  userId,
  locale = "fr",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosenSiteId, setChosenSiteId] = useState<string | null>(
    defaultSite?.id ?? null,
  );
  const [now, setNow] = useState<Date>(() => new Date());
  const [geoStatus, setGeoStatus] = useState<
    | { kind: "idle" }
    | { kind: "blocked"; reason: string }
    | { kind: "ok"; distance_m?: number | null }
  >({ kind: "idle" });
  const inFlight = useRef(false);

  // Tick chaque minute pour mettre à jour la durée écoulée.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const chosenSite =
    availableSites.find((s) => s.id === chosenSiteId) ?? defaultSite;

  function handle() {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        // Vibration tactile (best-effort).
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try { navigator.vibrate(50); } catch { /* noop */ }
        }
        const geo = await tryGeo(geofenceStrict && !isClockedIn);
        if (isClockedIn) {
          const r = await clockOutAction({ geo: geo ?? undefined });
          if (r.error) toast.error(r.error);
          else {
            toast.success(`${t("clock.bye", locale)} \u{1F44B}`);
            router.refresh();
          }
          return;
        }

        // === Clock-IN : checks géoloc + selfie =================================
        if (geofenceStrict && !geo) {
          setGeoStatus({
            kind: "blocked",
            reason: t("clock.geo_required_strict", locale),
          });
          toast.error(t("clock.geo_required_toast", locale));
          return;
        }

        // Capture selfie (best-effort si non requis, bloquant si requis).
        let selfiePath: string | null = null;
        let selfieFailure: string | null = null;
        if (selfieRequired) {
          try {
            selfiePath = await captureAndUploadSelfie(userId);
          } catch (e) {
            selfieFailure = (e as Error).message ?? "selfie capture failed";
            console.warn("[clock] selfie failed:", selfieFailure);
            // Si getUserMedia n'existe pas (vieux navigateur) → on autorise
            // mais on flag is_anomalous côté serveur. Karim a explicitement
            // demandé ce fallback dans le brief.
            const noApi = /non supporté|getUserMedia/i.test(selfieFailure);
            if (!noApi) {
              toast.error(t("clock.selfie_required_toast", locale));
              return;
            }
            // Sinon on continue : le serveur tag is_anomalous=true.
            toast.warning(t("clock.selfie_unavailable", locale));
          }
        }

        const r = await clockInAction({
          siteId: chosenSiteId ?? undefined,
          geo: geo ?? undefined,
          selfieStoragePath: selfiePath,
          selfieFailureReason: selfieFailure,
        });
        if (r.error) {
          setGeoStatus({ kind: "blocked", reason: r.error });
          toast.error(r.error);
        } else {
          setGeoStatus({ kind: "ok", distance_m: r.distance_m ?? null });
          toast.success(`${t("clock.welcome", locale)} \u{2728}`);
          router.refresh();
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  const inSince = clockInAt ? new Date(clockInAt) : null;

  // Comparaison heure prévue vs heure réelle (au moment du clock-in)
  let lateMin: number | null = null;
  if (todayShift && inSince) {
    const [h, m] = todayShift.start.split(":").map(Number);
    const expected = new Date(inSince);
    expected.setHours(h, m, 0, 0);
    lateMin = Math.round((inSince.getTime() - expected.getTime()) / 60000);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className={[
          "w-full rounded-2xl px-6 py-10 text-white font-bold text-2xl",
          "transition-all active:scale-[0.99] disabled:opacity-60",
          "shadow-[var(--shadow-lg)] flex flex-col items-center gap-2",
          isClockedIn
            ? "bg-danger hover:bg-danger/90"
            : "bg-success hover:bg-success/90",
        ].join(" ")}
      >
        {isClockedIn ? (
          <>
            <LogOut className="h-10 w-10" />
            <span>{t("clock.tap_to_clock_out", locale)}</span>
            {inSince ? (
              <span className="text-sm font-normal opacity-90">
                {t("clock.arrived_at", locale, {
                  time: inSince.toLocaleTimeString(dateLocaleStr(locale), {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  elapsed: formatElapsed(inSince, now, locale),
                })}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <LogIn className="h-10 w-10" />
            <span>{t("clock.tap_to_clock_in", locale)}</span>
            {todayShift ? (
              <span className="text-sm font-normal opacity-90">
                {t("clock.shift_planned_short", locale, { start: todayShift.start, end: todayShift.end })}
              </span>
            ) : (
              <span className="text-sm font-normal opacity-90">{t("clock.one_tap_hint", locale)}</span>
            )}
          </>
        )}
      </button>

      {/* Indicateur géoloc / selfie */}
      {!isClockedIn && (geofenceStrict || selfieRequired) ? (
        <div className="flex flex-wrap items-center justify-center gap-3 px-2 text-xs">
          {geofenceStrict ? (
            <span
              className={[
                "inline-flex items-center gap-1",
                geoStatus.kind === "ok"
                  ? "text-success font-bold"
                  : geoStatus.kind === "blocked"
                    ? "text-danger font-bold"
                    : "text-ink-3",
              ].join(" ")}
            >
              <MapPin className="h-3.5 w-3.5" />
              {geoStatus.kind === "ok"
                ? geoStatus.distance_m != null
                  ? t("clock.geo_located_far", locale, { meters: geoStatus.distance_m })
                  : t("clock.geo_located", locale)
                : geoStatus.kind === "blocked"
                  ? geoStatus.reason
                  : t("clock.geo_required", locale)}
            </span>
          ) : null}
          {selfieRequired ? (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <Camera className="h-3.5 w-3.5" /> {t("clock.selfie_required", locale)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Site auto-détecté + switch */}
      {!isClockedIn ? (
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="text-xs text-ink-3 inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {chosenSite ? (
              <>
                {t("common.site", locale)}{" "}
                <span
                  className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-white text-[10px] font-bold"
                  style={{ backgroundColor: chosenSite.color ?? "#666" }}
                >
                  {chosenSite.code}
                </span>{" "}
                <span className="font-bold text-ink-2">{chosenSite.name}</span>
              </>
            ) : (
              <span className="italic">{t("clock.no_site_detected", locale)}</span>
            )}
          </div>
          {availableSites.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="text-xs inline-flex items-center gap-0.5 text-ink-3 hover:text-gold-dark"
              >
                {t("clock.change_site", locale)} <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("clock.my_sites", locale)}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableSites.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => setChosenSiteId(s.id)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded"
                      style={{ backgroundColor: s.color ?? "#999" }}
                    />
                    <span className="font-mono font-bold text-[10px]">{s.code}</span>
                    <span className="text-xs">{s.name}</span>
                    {s.is_primary ? (
                      <span className="ml-auto text-[9px] uppercase font-bold text-gold-dark">
                        {t("clock.site_primary", locale)}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      {/* Comparaison shift prévu vs réel */}
      {isClockedIn && lateMin !== null ? (
        <div className="text-xs text-center text-ink-3">
          {lateMin > 5
            ? t("clock.late_min", locale, { n: lateMin })
            : lateMin < -5
              ? t("clock.early_min", locale, { n: Math.abs(lateMin) })
              : t("clock.on_time", locale)}
        </div>
      ) : null}
    </div>
  );
}
