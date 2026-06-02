"use client";

import { useTransition } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getValiseDocSignedUrlAction } from "./actions";

export function DownloadLink({ bucket, storagePath, externalUrl }: {
  bucket: string | null;
  storagePath: string | null;
  externalUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
      >
        <ExternalLink className="w-3 h-3" /> Ouvrir
      </a>
    );
  }

  if (!bucket || !storagePath) {
    return <span className="text-[10px] text-ink-3">—</span>;
  }

  function go() {
    startTransition(async () => {
      const r = await getValiseDocSignedUrlAction({ bucket: bucket!, storagePath: storagePath! });
      if (r.ok && r.url) {
        window.open(r.url, "_blank");
      } else {
        toast.error(r.error ?? "URL KO");
      }
    });
  }

  return (
    <button
      onClick={go}
      disabled={pending}
      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-muted text-foreground border border-line hover:bg-line"
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
      Télécharger
    </button>
  );
}
