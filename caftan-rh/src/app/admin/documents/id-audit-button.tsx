"use client";

// Karim 2026-07-11 : bouton « Vérifier toutes les cartes d'identité » -> lance
// l'audit global et envoie UNE notif admin. Affiche un résumé en toast.

import { useTransition } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runIdCardAuditAction } from "./id-audit-actions";

export function IdAuditButton() {
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      const r = await runIdCardAuditAction();
      if (r.ok) toast.success(r.summary ?? "Audit terminé. Notification envoyée.");
      else toast.error(r.error ?? "Échec de l'audit.");
    });
  }
  return (
    <Button variant="gold" size="sm" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
      Vérifier toutes les cartes d&apos;identité
    </Button>
  );
}
