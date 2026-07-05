"use client";

// Karim 2026-07-05 : bloc "données à encoder" avec bouton COPIER (1 clic -> presse-papier)
// pour aller le plus vite possible sur le formulaire HR Consult / ONSS.

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DimonaCopyBlock({ data }: { data: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible : le texte reste sélectionnable (select-all).
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <p className="text-xs text-ink-3">Un clic copie tout, puis colle sur le formulaire.</p>
        <Button size="sm" variant={copied ? "outline" : "gold"} onClick={copy} className="shrink-0">
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copié !
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copier les données
            </>
          )}
        </Button>
      </div>
      <pre className="p-4 pt-2 text-xs whitespace-pre-wrap font-mono text-ink-2 leading-relaxed select-all">
        {data}
      </pre>
    </div>
  );
}
