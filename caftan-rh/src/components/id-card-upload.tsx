"use client";

// Karim 2026-06-17 : dépôt de la carte d'identité (recto + verso). La capture se
// fait via une CAMÉRA IN-APP avec cadre de visée en forme de carte (le tap n'ouvre
// plus l'appareil photo standard sans repère). Les 2 images sont recadrées sur le
// cadre puis compressées (JPEG) ; le serveur les fusionne sur UNE seule page PDF.

import { useState, useTransition } from "react";
import { Loader2, IdCard, Check, Upload, RefreshCw, Camera, Sparkles, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { IdCardCamera } from "@/components/id-card-camera";
import {
  saveIdCardAdminAction,
  saveIdCardMeAction,
  saveIdCardTokenAction,
  type IdCardPayload,
} from "@/lib/id-card-actions";
import { extractIdCardTokenAction, type WorkInfo } from "@/lib/id-extraction-actions";
import type { ExtractedId } from "@/lib/id-extraction";

type Kind = "admin" | "me" | "token";
type Side = "recto" | "verso";

/** Champs identité extraits, remontés au formulaire parent pour pré-remplissage. */
export type IdExtractedFields = {
  full_name: string | null;
  birth_date: string | null;
  nrn: string | null;
  nationality: string | null;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new window.Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("image illisible"));
    i.src = src;
  });
}

async function compressDataUrl(dataUrl: string, maxDim = 1400, quality = 0.82): Promise<string> {
  const img = await loadImage(dataUrl);
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas KO");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function IdCardUpload({
  kind,
  employeeId,
  token,
  existing,
  onExtracted,
}: {
  kind: Kind;
  employeeId?: string;
  token?: string;
  existing?: { fileName: string; at: string } | null;
  /** Karim 2026-07-11 : pré-remplissage du formulaire à partir de l'extraction IA
   *  (self-service token uniquement). Le travailleur confirme ensuite les champs. */
  onExtracted?: (fields: IdExtractedFields) => void;
}) {
  const [recto, setRecto] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);
  const [cameraFor, setCameraFor] = useState<Side | null>(null);
  const [busyField, setBusyField] = useState<Side | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [replace, setReplace] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<{ data: ExtractedId; work: WorkInfo } | null>(null);

  async function runExtraction(payload: IdCardPayload) {
    if (kind !== "token" || !token) return;
    setAnalyzing(true);
    try {
      const r = await extractIdCardTokenAction(token, payload);
      if (r.ok) {
        setExtracted({ data: r.data, work: r.work });
        onExtracted?.({
          full_name: r.data.full_name,
          birth_date: r.data.birth_date,
          nrn: r.data.nrn,
          nationality: r.data.nationality,
        });
        toast.success("Carte analysée — vérifie et confirme les infos pré-remplies.");
      }
      // En cas d'échec d'extraction : silencieux (le PDF est déjà enregistré).
    } catch {
      /* non bloquant */
    } finally {
      setAnalyzing(false);
    }
  }

  async function onCameraCapture(which: Side, dataUrl: string) {
    setCameraFor(null);
    setBusyField(which);
    try {
      const b64 = await compressDataUrl(dataUrl);
      if (which === "recto") setRecto(b64);
      else setVerso(b64);
    } catch {
      toast.error("Image illisible, réessaie.");
    } finally {
      setBusyField(null);
    }
  }

  function submit() {
    if (!recto || !verso) {
      toast.error("Ajoute le recto ET le verso avant d'enregistrer.");
      return;
    }
    const payload: IdCardPayload = {
      rectoB64: recto,
      rectoMime: "image/jpeg",
      versoB64: verso,
      versoMime: "image/jpeg",
    };
    start(async () => {
      const r =
        kind === "admin"
          ? await saveIdCardAdminAction(employeeId!, payload)
          : kind === "token"
            ? await saveIdCardTokenAction(token!, payload)
            : await saveIdCardMeAction(payload);
      if (r.ok) {
        toast.success("Carte d'identité enregistrée (PDF).");
        // Karim 2026-07-11 : extraction IA + contrôle validité/droit au travail
        // (self-service token). Le PDF est déjà sauvé ; l'analyse pré-remplit et
        // escalade côté admin si besoin.
        if (kind === "token") await runExtraction(payload);
        setDone(true);
        setRecto(null);
        setVerso(null);
        setReplace(false);
      } else {
        toast.error(r.error ?? "Échec de l'enregistrement.");
      }
    });
  }

  const alreadyHas = !!existing && !done;

  if (alreadyHas && !replace) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" /> Carte d&apos;identité enregistrée
        </div>
        <p className="text-[11px] text-emerald-700">
          Déposée le {new Date(existing!.at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}.
        </p>
        <button
          type="button"
          onClick={() => setReplace(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 underline"
        >
          <RefreshCw className="h-3 w-3" /> Remplacer
        </button>
      </div>
    );
  }

  if (done) {
    const w = extracted?.work;
    const d = extracted?.data;
    const expiryWarn = w && w.daysToExpiry != null && w.daysToExpiry < 60;
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" /> Carte d&apos;identité enregistrée (PDF recto/verso).
        </div>
        {analyzing ? (
          <div className="rounded-lg border border-line bg-surface p-3 flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyse du document en cours…
          </div>
        ) : extracted ? (
          <div className="rounded-lg border border-line bg-white p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-gold-dark" /> Infos lues sur ta carte
            </div>
            <p className="text-[11px] text-ink-3">
              Vérifie et <strong>corrige si besoin</strong> les champs pré-remplis ci-dessous, puis confirme.
            </p>
            <ul className="text-[12px] text-ink-2 space-y-0.5">
              {d?.full_name ? <li>Nom : <strong>{d.full_name}</strong></li> : null}
              {d?.birth_date ? <li>Naissance : <strong>{d.birth_date}</strong></li> : null}
              {d?.nationality ? <li>Nationalité : <strong>{d.nationality}</strong></li> : null}
              {d?.expiry_date ? (
                <li className={expiryWarn ? "text-amber-700 font-semibold" : ""}>
                  Validité du document : <strong>{d.expiry_date}</strong>
                  {w?.daysToExpiry != null
                    ? w.daysToExpiry < 0
                      ? " — EXPIRÉ"
                      : w.daysToExpiry < 60
                        ? ` — expire dans ${w.daysToExpiry} j`
                        : ""
                    : ""}
                </li>
              ) : null}
            </ul>
            {w ? (
              <div
                className={`mt-1 rounded-md p-2 text-[11px] flex items-start gap-1.5 ${
                  w.status === "ue"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {w.status === "ue" ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <span>
                  {w.status === "ue"
                    ? "Droit au travail confirmé (UE/EEE/Suisse)."
                    : "Le service RH va vérifier ton droit au travail et te recontacter si un document est nécessaire."}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderSide(which: Side, value: string | null) {
    const label = which === "recto" ? "Recto" : "Verso";
    return (
      <button
        type="button"
        onClick={() => setCameraFor(which)}
        disabled={pending}
        className="flex-1 text-left"
      >
        {/* Cadre en forme de carte d'identité (ratio ISO ≈ 1,585). */}
        <div
          className="relative w-full overflow-hidden rounded-lg border-2 border-dashed bg-white"
          style={{ aspectRatio: "1.585 / 1", borderColor: value ? "#34d399" : "#fca5a5" }}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt={label} className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-3 w-3" />
              </span>
            </>
          ) : busyField === which ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
            </div>
          ) : (
            <div className="absolute inset-2 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-3/40 text-center">
              <Camera className="h-5 w-5 text-rose-500" />
              <span className="text-xs font-semibold text-rose-700">{label}</span>
              <span className="px-2 text-[10px] leading-tight text-ink-3">Prendre en photo dans le cadre</span>
            </div>
          )}
        </div>
        <div className={`mt-1 text-center text-[10px] font-semibold ${value ? "text-emerald-700" : "text-rose-600"}`}>
          {label}
          {value ? " ✓ — toucher pour refaire" : ""}
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <IdCard className="h-4 w-4 text-gold-dark" /> Carte d&apos;identité (recto + verso)
      </div>
      <p className="text-[11px] text-ink-3">
        Touche un cadre pour ouvrir la caméra : <strong>aligne la carte dans le cadre</strong> et remplis-le.
        Recto + verso seront fusionnés sur une <strong>seule page PDF</strong>.
      </p>
      <div className="flex gap-2">
        {renderSide("recto", recto)}
        {renderSide("verso", verso)}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !recto || !verso}
        className="w-full min-h-[44px] rounded-lg bg-ink text-canvas font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Enregistrer ma carte d&apos;identité
      </button>

      {cameraFor ? (
        <IdCardCamera
          label={cameraFor === "recto" ? "Recto" : "Verso"}
          onCapture={(dataUrl) => onCameraCapture(cameraFor, dataUrl)}
          onClose={() => setCameraFor(null)}
        />
      ) : null}
    </div>
  );
}
