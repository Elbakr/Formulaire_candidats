"use client";

// Karim 2026-07-11 : bloc éditable « Titre de séjour / droit au travail » sur la
// fiche. Auto-save par champ ; recalcule le statut de droit au travail côté serveur.
// Alimente le rappel d'expiration (45 j avant). CHAQUE champ COMMUNIQUE visuellement
// son état (ok / à compléter / alerte) et un bandeau global ALERTE si nécessaire
// (document expiré, droit au travail à régulariser).

import { useEffect, useState, useTransition } from "react";
import {
  IdCard,
  Loader2,
  Check,
  ShieldCheck,
  ShieldAlert,
  Plane,
  AlertTriangle,
  CalendarX,
  CalendarClock,
  CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { saveResidenceFieldAction, setPostedWorkerAction } from "./residence-actions";
import { sendResidenceUpdateRequestAction } from "./residence-request-actions";
import { EU_EEA_CH_NATIONALITIES, OTHER_NATIONALITIES } from "@/lib/nationalities";

const DOC_TYPES = [
  { value: "", label: "—" },
  { value: "ci_belge", label: "Carte d'identité belge" },
  { value: "titre_sejour", label: "Titre de séjour" },
  { value: "passeport", label: "Passeport" },
  { value: "autre", label: "Autre" },
];

type FieldStatus = "ok" | "warn" | "danger" | "neutral";
const BORDER: Record<FieldStatus, string> = {
  ok: "border-emerald-300 focus:border-emerald-500",
  warn: "border-amber-400 bg-amber-50/50 focus:border-amber-500",
  danger: "border-red-400 bg-red-50/60 focus:border-red-500",
  neutral: "border-line focus:border-gold",
};

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - t0.getTime()) / 86_400_000);
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function ResidenceFields({
  employeeId,
  nationality,
  docType,
  docExpiry,
  docNumber,
  workAuthorization,
  postedWorker,
}: {
  employeeId: string;
  nationality: string | null;
  docType: string | null;
  docExpiry: string | null;
  docNumber: string | null;
  workAuthorization: string | null;
  postedWorker: boolean;
}) {
  const [nat, setNat] = useState(nationality ?? "");
  const [dType, setDType] = useState(docType ?? "");
  const [expiry, setExpiry] = useState(docExpiry ? docExpiry.slice(0, 10) : "");
  const [docNum, setDocNum] = useState(docNumber ?? "");
  const [work, setWork] = useState<string | null>(workAuthorization);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [posted, setPosted] = useState(postedWorker);
  const [postedSaving, startPosted] = useTransition();
  const [, start] = useTransition();
  const [sending, startSend] = useTransition();

  function sendUpdateRequest() {
    startSend(async () => {
      const r = await sendResidenceUpdateRequestAction(employeeId);
      if (r.ok) toast.success(`Mail envoyé au travailleur${r.to ? ` (${r.to})` : ""}.`);
      else toast.error(r.error ?? "Échec de l'envoi.");
    });
  }

  // Resync depuis les props après une extraction IA (router.refresh côté bouton).
  useEffect(() => setNat(nationality ?? ""), [nationality]);
  useEffect(() => setDType(docType ?? ""), [docType]);
  useEffect(() => setExpiry(docExpiry ? docExpiry.slice(0, 10) : ""), [docExpiry]);
  useEffect(() => setDocNum(docNumber ?? ""), [docNumber]);
  useEffect(() => setWork(workAuthorization), [workAuthorization]);

  function togglePosted() {
    const next = !posted;
    setPosted(next);
    startPosted(async () => {
      const r = await setPostedWorkerAction(employeeId, next);
      if (r.error) {
        setPosted(!next);
        toast.error(r.error);
      } else {
        toast.success(next ? "Marqué détaché : Limosa + A1 requis." : "Détachement retiré.");
      }
    });
  }

  function save(field: string, value: string) {
    setSavingKey(field);
    start(async () => {
      const r = await saveResidenceFieldAction(employeeId, field, value);
      setSavingKey(null);
      if (r.ok) {
        if (r.workStatus) setWork(r.workStatus);
      } else {
        toast.error(r.error ?? "Échec de l'enregistrement.");
      }
    });
  }

  // ── États dérivés (visuels) ────────────────────────────────────────────────
  const expiryDays = daysUntil(expiry);
  const isExpired = expiryDays != null && expiryDays < 0;
  const expiringSoon = expiryDays != null && expiryDays >= 0 && expiryDays <= 45;
  const isEu = work === "ue";
  const nonEu = work != null && work !== "ue";

  const natMissing = !nat.trim();
  const docTypeMissing = nonEu && !dType;
  const expiryMissing = nonEu && !expiry;

  const natStatus: FieldStatus = natMissing ? "warn" : "ok";
  const docTypeStatus: FieldStatus = docTypeMissing ? "warn" : dType ? "ok" : "neutral";
  const expiryStatus: FieldStatus = isExpired
    ? "danger"
    : expiringSoon || expiryMissing
      ? "warn"
      : expiry
        ? "ok"
        : "neutral";

  // Bandeau global : priorité au DANGER (expiré / refusé), puis alerte, puis OK.
  const danger = isExpired || work === "refuse";
  const warn =
    !danger &&
    (work === "a_verifier" || work === "titre_valide" || natMissing || docTypeMissing || expiryMissing || expiringSoon);
  const good = !danger && !warn && work === "ue";

  const bannerText = isExpired
    ? `Document EXPIRÉ le ${fmtDate(expiry)} (${Math.abs(expiryDays!)} j) — droit au travail à régulariser.`
    : work === "refuse"
      ? "Hors-UE — titre de séjour expiré / non valable pour le travail. À régulariser."
      : work === "a_verifier"
        ? "Hors-UE — droit au travail À VÉRIFIER (titre de séjour autorisant le travail requis)."
        : work === "titre_valide"
          ? "Hors-UE — titre semblant valide : à CONFIRMER par l'admin (permis unique ; Limosa + A1 si détaché)."
          : natMissing
            ? "Renseigne la nationalité pour évaluer le droit au travail."
            : docTypeMissing || expiryMissing
              ? "Titre de séjour incomplet (type et/ou date de validité manquants)."
              : expiringSoon
                ? `Document expire bientôt (dans ${expiryDays} j) — prévoir le renouvellement.`
                : "Ressortissant UE/EEE/Suisse : droit au travail sans permis.";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <IdCard className="h-4 w-4 text-gold-dark" />
        Titre de séjour / droit au travail
        <span className="text-[10px] font-normal text-ink-3">(auto-enregistré)</span>
      </div>

      {/* Bandeau global ALERTANT */}
      <div
        className={`rounded-md p-2.5 text-[12px] flex items-start gap-2 font-medium ${
          danger
            ? "bg-red-50 text-red-800 border border-red-300"
            : warn
              ? "bg-amber-50 text-amber-900 border border-amber-300"
              : good
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-surface-2 text-ink-2 border border-line"
        }`}
      >
        {danger ? (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        ) : warn ? (
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        ) : good ? (
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        ) : (
          <IdCard className="h-4 w-4 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <span>
            {danger ? "⚠️ " : ""}
            Droit au travail : <strong>{bannerText}</strong>
            {(danger || warn) && nonEu ? " Décision finale humaine (admin)." : ""}
          </span>
          {danger || warn || posted ? (
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant={danger ? "danger" : "outline"}
                onClick={sendUpdateRequest}
                disabled={sending}
                title="Envoyer un mail au travailleur : alerte + demande d'upload de la nouvelle carte de séjour (+ Limosa/A1 si détaché)"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
                Demander la mise à jour au travailleur
              </Button>
              <p className="text-[10px] text-ink-3 mt-1">
                Mail bilingue (FR/NL) : alerte + lien pour déposer la nouvelle carte de séjour valide
                {posted ? " + Limosa (L1) et A1" : ""}. Envoi manuel, 1 clic.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nationalité" saving={savingKey === "nationality"} status={natStatus} hint={natMissing ? "à renseigner" : undefined}>
          <input
            type="text"
            list="nationalities-list"
            value={nat}
            placeholder="Choisir dans la liste…"
            onChange={(e) => {
              const v = e.currentTarget.value;
              setNat(v);
              if (EU_EEA_CH_NATIONALITIES.includes(v) || OTHER_NATIONALITIES.includes(v)) save("nationality", v);
            }}
            onBlur={(e) => save("nationality", e.currentTarget.value)}
            className={`w-full px-2 py-1.5 border rounded text-sm bg-surface outline-none ${BORDER[natStatus]}`}
          />
          <datalist id="nationalities-list">
            <optgroup label="UE / EEE / Suisse (droit au travail direct)">
              {EU_EEA_CH_NATIONALITIES.map((n) => (
                <option key={n} value={n} />
              ))}
            </optgroup>
            <optgroup label="Hors UE (titre de séjour requis)">
              {OTHER_NATIONALITIES.map((n) => (
                <option key={n} value={n} />
              ))}
            </optgroup>
          </datalist>
        </Field>

        <Field
          label="Type de document"
          saving={savingKey === "residence_doc_type"}
          status={docTypeStatus}
          hint={docTypeMissing ? "titre de séjour à renseigner" : undefined}
        >
          <select
            value={dType}
            onChange={(e) => {
              setDType(e.currentTarget.value);
              save("residence_doc_type", e.currentTarget.value);
            }}
            className={`w-full px-2 py-1.5 border rounded text-sm bg-surface outline-none ${BORDER[docTypeStatus]}`}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Date de validité"
          saving={savingKey === "residence_doc_expiry"}
          status={expiryStatus}
          hint={
            isExpired
              ? `EXPIRÉ depuis ${Math.abs(expiryDays!)} j (le ${fmtDate(expiry)})`
              : expiringSoon
                ? `expire dans ${expiryDays} j`
                : expiryMissing
                  ? "à renseigner"
                  : expiry
                    ? "valide"
                    : undefined
          }
        >
          <input
            type="date"
            value={expiry}
            onChange={(e) => {
              setExpiry(e.currentTarget.value);
              save("residence_doc_expiry", e.currentTarget.value);
            }}
            className={`w-full px-2 py-1.5 border rounded text-sm bg-surface outline-none ${BORDER[expiryStatus]}`}
          />
        </Field>

        <Field label="N° du document" saving={savingKey === "residence_doc_number"} status={docNum ? "ok" : "neutral"}>
          <input
            type="text"
            value={docNum}
            onChange={(e) => setDocNum(e.currentTarget.value)}
            onBlur={(e) => save("residence_doc_number", e.currentTarget.value)}
            className={`w-full px-2 py-1.5 border rounded text-sm bg-surface outline-none ${BORDER[docNum ? "ok" : "neutral"]}`}
          />
        </Field>
      </div>

      {/* Travailleur détaché : Limosa + A1 requis. */}
      <div className="border-t border-line pt-2 flex items-start gap-2">
        <Plane className={`h-4 w-4 shrink-0 mt-0.5 ${posted ? "text-indigo-600" : "text-ink-3"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-ink">Travailleur détaché (employeur étranger)</div>
          <p className="text-[11px] text-ink-2 leading-snug">
            {posted
              ? "Documents requis à contrôler : Limosa (L1) + certificat A1. Vérification humaine obligatoire."
              : "Active si le travailleur est détaché en Belgique par un employeur étranger."}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePosted}
          disabled={postedSaving}
          aria-pressed={posted}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            posted ? "bg-indigo-600" : "bg-ink-3/40"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              posted ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}

const STATUS_DOT: Record<FieldStatus, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  danger: "text-red-500",
  neutral: "text-transparent",
};
const STATUS_ICON: Record<FieldStatus, React.ReactNode> = {
  ok: <CalendarCheck className="h-3 w-3" />,
  warn: <CalendarClock className="h-3 w-3" />,
  danger: <CalendarX className="h-3 w-3" />,
  neutral: null,
};

function Field({
  label,
  saving,
  status = "neutral",
  hint,
  children,
}: {
  label: string;
  saving: boolean;
  status?: FieldStatus;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-ink-2 flex items-center gap-1 mb-0.5">
        {label}
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-ink-3" />
        ) : (
          <Check className={`h-3 w-3 ${status === "ok" ? "text-emerald-500" : "text-transparent"}`} />
        )}
      </label>
      {children}
      {hint ? (
        <div
          className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold ${
            status === "danger" ? "text-red-600" : status === "warn" ? "text-amber-600" : "text-emerald-600"
          }`}
        >
          <span className={STATUS_DOT[status]}>{STATUS_ICON[status]}</span>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
