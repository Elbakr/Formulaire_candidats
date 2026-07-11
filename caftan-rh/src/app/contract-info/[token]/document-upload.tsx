"use client";

// Karim 2026-07-11 : dépôt self-service d'UN document (Limosa / A1) dans le
// formulaire de complétion. Accepte PDF ou image ; lance le contrôle IA à l'envoi.

import { useState, useTransition } from "react";
import { Loader2, Upload, Check, ShieldCheck, ShieldAlert, FileUp } from "lucide-react";
import { toast } from "sonner";
import { saveWorkerDocumentTokenAction, type WorkerDocKind } from "./document-actions";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("lecture impossible"));
    r.readAsDataURL(file);
  });
}

export function WorkerDocumentUpload({
  token,
  kind,
  title,
  hint,
}: {
  token: string;
  kind: WorkerDocKind;
  title: string;
  hint: string;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [ia, setIa] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner le même fichier
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Fichier trop lourd (max 12 Mo).");
      return;
    }
    start(async () => {
      try {
        const dataUrl = await fileToDataUrl(file);
        const r = await saveWorkerDocumentTokenAction(token, kind, dataUrl, file.type || "application/octet-stream");
        if (r.ok) {
          setDone(true);
          setIa(r.iaStatus ?? null);
          toast.success(`${title} enregistré.`);
        } else {
          toast.error(r.error ?? "Échec de l'envoi.");
        }
      } catch {
        toast.error("Échec de la lecture du fichier.");
      }
    });
  }

  return (
    <div className={`rounded-lg border p-3 ${done ? "border-emerald-300 bg-emerald-50" : "border-line bg-surface"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        {done ? <Check className="h-4 w-4 text-emerald-600" /> : <FileUp className="h-4 w-4 text-gold-dark" />}
        {title}
      </div>
      <p className="text-[11px] text-ink-3 mt-0.5">{hint}</p>
      {ia ? (
        <div
          className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
            ia === "conforme" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {ia === "conforme" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {ia === "conforme" ? "Vérifié par l'IA" : "Reçu — vérification en cours par le RH"}
        </div>
      ) : null}
      <label className="mt-2 inline-flex items-center gap-2 rounded-lg bg-ink text-canvas text-sm font-bold px-3 py-2 cursor-pointer active:scale-[0.98] transition-all">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {done ? "Remplacer" : "Choisir le fichier"}
        <input type="file" accept="application/pdf,image/*" onChange={onPick} disabled={pending} className="hidden" />
      </label>
    </div>
  );
}
