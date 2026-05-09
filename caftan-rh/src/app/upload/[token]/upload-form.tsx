"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_BYTES = 15 * 1024 * 1024;

export function UploadForm({ token, docLabel }: { token: string; docLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      setPreview(null);
      setError(null);
      return;
    }
    if (f.size === 0) {
      setError("Fichier vide.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Fichier trop lourd (max ${Math.round(MAX_BYTES / 1024 / 1024)} Mo).`);
      return;
    }
    setError(null);
    setFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  function onSubmit() {
    if (!file) {
      toast.warning("Choisis d'abord un fichier.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file", file);
      try {
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? `Erreur ${res.status}`);
          toast.error(data.error ?? `Erreur ${res.status}`);
          return;
        }
        setDone(true);
        toast.success("Document reçu, merci !");
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        toast.error(msg);
      }
    });
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  if (done) {
    return (
      <div className="space-y-3 text-center py-6">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-success-light text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="text-lg font-bold">Document reçu, merci !</div>
        <p className="text-sm text-ink-2">
          Tu peux fermer cette page. L&apos;équipe RH va vérifier ton fichier.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={
          "block border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors " +
          (isDragging ? "border-gold bg-gold-light/20" : "border-line hover:border-gold")
        }
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="space-y-2">
            {preview ? (
              <img
                src={preview}
                alt="aperçu"
                className="max-h-40 mx-auto rounded border border-line"
              />
            ) : (
              <FileText className="h-10 w-10 mx-auto text-ink-3" />
            )}
            <div className="text-sm font-semibold truncate">{file.name}</div>
            <div className="text-xs text-ink-3">
              {(file.size / 1024).toFixed(0)} Ko · {file.type || "fichier"}
            </div>
            <button
              type="button"
              className="text-xs text-gold-dark underline"
              onClick={(e) => {
                e.preventDefault();
                pickFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Choisir un autre fichier
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-ink-3" />
            <div className="text-sm font-semibold">Cliquer ou glisser-déposer</div>
            <div className="text-xs text-ink-3">
              {docLabel} — JPG, PNG, PDF (15 Mo max)
            </div>
          </div>
        )}
      </label>

      {error ? (
        <div className="flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Button
        type="button"
        variant="gold"
        className="w-full"
        onClick={onSubmit}
        disabled={!file || pending}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> Envoyer
          </>
        )}
      </Button>
    </div>
  );
}
