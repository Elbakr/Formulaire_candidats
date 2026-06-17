"use client";

// Karim 2026-06-17 : encart fiche admin pour la carte d'identité du travailleur.
// Statut (présente/absente + rappel « requise pour envoyer le contrat »), dépôt
// recto/verso (admin peut le faire à la place du travailleur), téléchargement du
// PDF et envoi au secrétariat social / dossier RH.

import { useState, useTransition } from "react";
import { Loader2, Download, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { IdCardUpload } from "@/components/id-card-upload";
import { sendIdCardToSecsocAction } from "@/lib/id-card-actions";

export function IdCardAdminPanel({
  employeeId,
  existing,
  downloadUrl,
}: {
  employeeId: string;
  existing: { fileName: string; at: string } | null;
  downloadUrl: string | null;
}) {
  const [pending, start] = useTransition();

  function sendSecsoc() {
    start(async () => {
      const r = await sendIdCardToSecsocAction(employeeId);
      if (r.ok) toast.success("Carte d'identité envoyée au secrétariat social / RH.");
      else toast.error(r.error ?? "Échec de l'envoi.");
    });
  }

  return (
    <div className="space-y-3">
      {!existing ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>Carte d&apos;identité manquante.</strong> Elle est <strong>requise</strong> pour
            pouvoir envoyer le contrat à signer. Le travailleur peut la déposer via son lien, ou tu
            peux le faire ici.
          </span>
        </div>
      ) : null}

      <IdCardUpload kind="admin" employeeId={employeeId} existing={existing} />

      {existing ? (
        <div className="flex flex-wrap gap-2">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" /> Télécharger le PDF
            </a>
          ) : null}
          <button
            type="button"
            onClick={sendSecsoc}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Envoyer au secrétariat social / RH
          </button>
        </div>
      ) : null}
    </div>
  );
}
