"use client";

// Karim 2026-07-11 : visionneuse « ebook » des documents du travailleur (CI,
// Limosa, A1…) directement sur la fiche. On sélectionne un document à gauche et on
// FAIT DÉFILER ses pages à droite (iframe PDF natif = scroll multi-pages, ou image),
// sans jamais sortir ni chercher le fichier.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { FileText, ImageIcon, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";

export type EbookDoc = {
  id: string;
  label: string;
  url: string;
  isPdf: boolean;
  kind: string;
  iaStatus: string | null;
};

function kindLabel(kind: string): string {
  const k = kind.toLowerCase();
  if (k === "id_card") return "Carte d'identité";
  if (k === "limosa") return "Limosa (L1)";
  if (k === "a1") return "Certificat A1";
  if (k === "contract_signed" || k.includes("contract")) return "Contrat";
  if (k === "cv") return "CV";
  if (k === "diploma") return "Diplôme";
  return kind || "Document";
}

export function DocumentsEbookViewer({ docs }: { docs: EbookDoc[] }) {
  const [selected, setSelected] = useState(0);
  if (!docs || docs.length === 0) return null;
  const cur = docs[Math.min(selected, docs.length - 1)];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-surface-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-gold-dark" />
        <span className="text-sm font-bold">Documents du travailleur</span>
        <span className="text-[11px] text-ink-3">({docs.length}) — défile les pages sans sortir</span>
      </div>

      <div className="grid md:grid-cols-[220px_1fr]">
        {/* Liste des documents */}
        <div className="border-b md:border-b-0 md:border-r border-line max-h-[80vh] overflow-auto">
          {docs.map((d, i) => {
            const active = i === Math.min(selected, docs.length - 1);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(i)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 border-b border-line/60 transition-colors ${
                  active ? "bg-gold-light/60" : "hover:bg-surface-2"
                }`}
              >
                {d.isPdf ? (
                  <FileText className="h-4 w-4 shrink-0 mt-0.5 text-ink-3" />
                ) : (
                  <ImageIcon className="h-4 w-4 shrink-0 mt-0.5 text-ink-3" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-ink truncate">{kindLabel(d.kind)}</div>
                  <div className="text-[10px] text-ink-3 truncate">{d.label}</div>
                  {d.iaStatus ? (
                    <div
                      className={`mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                        d.iaStatus === "conforme"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {d.iaStatus === "conforme" ? (
                        <ShieldCheck className="h-2.5 w-2.5" />
                      ) : (
                        <ShieldAlert className="h-2.5 w-2.5" />
                      )}
                      {d.iaStatus === "conforme" ? "IA conforme" : "IA : à vérifier"}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {/* Visionneuse (défilement des pages) */}
        <div className="bg-ink/5 min-h-[60vh]">
          <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-line bg-white">
            <span className="text-[12px] font-semibold text-ink truncate">{kindLabel(cur.kind)}</span>
            <a
              href={cur.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-gold-dark hover:underline shrink-0"
            >
              <ExternalLink className="h-3 w-3" /> Plein écran
            </a>
          </div>
          {cur.isPdf ? (
            <iframe
              key={cur.id}
              src={cur.url}
              title={cur.label}
              className="w-full h-[75vh] bg-white"
            />
          ) : (
            <div className="h-[75vh] overflow-auto flex items-start justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.url} alt={cur.label} className="max-w-full h-auto rounded shadow" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
