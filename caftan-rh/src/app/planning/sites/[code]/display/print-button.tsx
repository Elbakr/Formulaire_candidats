"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-line hover:bg-surface-2 text-xs font-bold"
    >
      <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
    </button>
  );
}
