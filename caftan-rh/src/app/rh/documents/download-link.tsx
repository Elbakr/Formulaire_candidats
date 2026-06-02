"use client";

import { useState, useTransition } from "react";
import { Download, ExternalLink, Loader2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { getValiseDocSignedUrlAction } from "./actions";

export function DownloadLink({ bucket, storagePath, externalUrl, title }: {
  bucket: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function resolveUrl(): Promise<string | null> {
    if (externalUrl) return externalUrl;
    if (!bucket || !storagePath) return null;
    const r = await getValiseDocSignedUrlAction({ bucket, storagePath });
    if (!r.ok || !r.url) {
      toast.error(r.error ?? "URL KO");
      return null;
    }
    return r.url;
  }

  function preview() {
    startTransition(async () => {
      const u = await resolveUrl();
      if (u) setPreviewUrl(u);
    });
  }

  function downloadOrOpen() {
    startTransition(async () => {
      const u = await resolveUrl();
      if (u) window.open(u, "_blank");
    });
  }

  if (!bucket && !externalUrl) {
    return <span className="text-[10px] text-ink-3">—</span>;
  }

  return (
    <>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={preview}
          disabled={pending}
          title="Aperçu inline"
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
        </button>
        <button
          onClick={downloadOrOpen}
          disabled={pending}
          title={externalUrl ? "Ouvrir dans un nouvel onglet" : "Télécharger"}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-muted text-foreground border border-line hover:bg-line"
        >
          {externalUrl ? <ExternalLink className="w-3 h-3" /> : <Download className="w-3 h-3" />}
        </button>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-sm font-semibold truncate">{title ?? "Aperçu du document"}</div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-line"
                >
                  Plein écran ↗
                </a>
                <button onClick={() => setPreviewUrl(null)} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={previewUrl}
              className="flex-1 w-full"
              title={title ?? "Document"}
            />
          </div>
        </div>
      )}
    </>
  );
}
