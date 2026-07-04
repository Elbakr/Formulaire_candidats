"use client";

// Karim 2026-07-04 : affiche + imprime le VRAI contrat (super layout : rendered_body
// figé si signé, sinon construit à l'identique de l'envoi). Iframe = isolation CSS
// totale (aucun style de l'app) et impression fidèle (on imprime l'iframe seule).

import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContractIframe({ html }: { html: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);

  function print() {
    const win = ref.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  if (!html) {
    return <p className="p-4 text-sm text-ink-3">Aperçu indisponible (document non encore généré).</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-surface">
        <h2 className="font-bold text-sm">Contrat (document final)</h2>
        <Button size="sm" variant="gold" onClick={print}>
          <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
        </Button>
      </div>
      <iframe
        ref={ref}
        srcDoc={html}
        title="Contrat"
        className="w-full bg-white"
        style={{ height: "80vh", border: "none" }}
      />
    </div>
  );
}
