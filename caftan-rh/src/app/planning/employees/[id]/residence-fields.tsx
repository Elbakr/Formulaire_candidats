"use client";

// Karim 2026-07-11 : bloc éditable « Titre de séjour / droit au travail » sur la
// fiche. Auto-save par champ ; recalcule le statut de droit au travail côté
// serveur (affiché en direct). Alimente le rappel d'expiration (45 j avant).

import { useState, useTransition } from "react";
import { IdCard, Loader2, Check, ShieldCheck, ShieldAlert, Plane } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { saveResidenceFieldAction, setPostedWorkerAction } from "./residence-actions";

const DOC_TYPES = [
  { value: "", label: "—" },
  { value: "ci_belge", label: "Carte d'identité belge" },
  { value: "titre_sejour", label: "Titre de séjour" },
  { value: "passeport", label: "Passeport" },
  { value: "autre", label: "Autre" },
];

const WORK_LABEL: Record<string, { text: string; ok: boolean }> = {
  ue: { text: "UE/EEE/Suisse — droit au travail sans permis", ok: true },
  titre_valide: { text: "Titre valide (à confirmer par l'admin)", ok: false },
  a_verifier: { text: "Hors-UE — droit au travail À VÉRIFIER", ok: false },
  refuse: { text: "Titre expiré / ne permet pas le travail", ok: false },
};

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
  const [work, setWork] = useState<string | null>(workAuthorization);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [posted, setPosted] = useState(postedWorker);
  const [postedSaving, startPosted] = useTransition();
  const [, start] = useTransition();

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

  const w = work ? WORK_LABEL[work] : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <IdCard className="h-4 w-4 text-gold-dark" />
        Titre de séjour / droit au travail
        <span className="text-[10px] font-normal text-ink-3">(auto-enregistré)</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nationalité" saving={savingKey === "nationality"}>
          <input
            type="text"
            defaultValue={nationality ?? ""}
            placeholder="ex. Belge, Marocaine…"
            onBlur={(e) => save("nationality", e.currentTarget.value)}
            className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
          />
        </Field>
        <Field label="Type de document" saving={savingKey === "residence_doc_type"}>
          <select
            defaultValue={docType ?? ""}
            onChange={(e) => save("residence_doc_type", e.currentTarget.value)}
            className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Date de validité" saving={savingKey === "residence_doc_expiry"}>
          <input
            type="date"
            defaultValue={docExpiry ? docExpiry.slice(0, 10) : ""}
            onChange={(e) => save("residence_doc_expiry", e.currentTarget.value)}
            className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
          />
        </Field>
        <Field label="N° du document" saving={savingKey === "residence_doc_number"}>
          <input
            type="text"
            defaultValue={docNumber ?? ""}
            onBlur={(e) => save("residence_doc_number", e.currentTarget.value)}
            className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
          />
        </Field>
      </div>

      {w ? (
        <div
          className={`rounded-md p-2 text-[12px] flex items-center gap-2 ${
            w.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {w.ok ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldAlert className="h-4 w-4 shrink-0" />}
          <span>
            Droit au travail : <strong>{w.text}</strong>
            {!w.ok ? " — vérification humaine requise." : ""}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-ink-3">
          Renseigne la nationalité pour évaluer le droit au travail, et la date de validité pour activer le
          rappel d&apos;expiration (45 j avant).
        </p>
      )}

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

function Field({ label, saving, children }: { label: string; saving: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-ink-2 flex items-center gap-1 mb-0.5">
        {label}
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-ink-3" />
        ) : (
          <Check className="h-3 w-3 text-transparent" />
        )}
      </label>
      {children}
    </div>
  );
}
