"use client";

// Karim 2026-07-11 : bouton « Vérifier toutes les cartes d'identité » -> lance
// l'audit global et envoie UNE notif admin. Affiche un résumé en toast.

import { useTransition } from "react";
import { ShieldCheck, ScanLine, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runIdCardAuditAction, extractAndAuditAction, checkDocumentsConformityAction } from "./id-audit-actions";

export function IdAuditButton() {
  const [pending, start] = useTransition();

  function runAudit() {
    start(async () => {
      const r = await runIdCardAuditAction();
      if (r.ok) toast.success(r.summary ?? "Audit terminé. Notification envoyée.");
      else toast.error(r.error ?? "Échec de l'audit.");
    });
  }
  function runExtract() {
    start(async () => {
      toast.info("Extraction IA des cartes déposées en cours…");
      const r = await extractAndAuditAction();
      if (r.ok) toast.success(r.summary ?? "Extraction + audit terminés. Notification envoyée.");
      else toast.error(r.error ?? "Échec de l'extraction.");
    });
  }
  function runConformity() {
    start(async () => {
      toast.info("Contrôle de conformité IA des documents en cours…");
      const r = await checkDocumentsConformityAction();
      if (r.ok) toast.success(r.summary ?? "Contrôle terminé. Notification envoyée.");
      else toast.error(r.error ?? "Échec du contrôle.");
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="gold" size="sm" onClick={runExtract} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1" />}
        Extraire &amp; mettre à jour depuis les cartes
      </Button>
      <Button variant="ghost" size="sm" onClick={runConformity} disabled={pending}>
        <FileCheck2 className="h-3.5 w-3.5 mr-1" />
        Contrôler conformité (IA)
      </Button>
      <Button variant="ghost" size="sm" onClick={runAudit} disabled={pending}>
        <ShieldCheck className="h-3.5 w-3.5 mr-1" />
        Auditer seulement
      </Button>
    </div>
  );
}
