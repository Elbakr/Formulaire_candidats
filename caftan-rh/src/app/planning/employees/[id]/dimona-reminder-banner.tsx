"use client";

// Karim 2026-05-29 : banniere de rappel Dimona apres signature du contrat.
// Affiche un bandeau rouge urgent + bouton "Ouvrir portail ONSS" + bouton
// "Auto-Dimona" (etape 2 stub).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dimonaMarkDoneAction, dimonaAutoSubmitAction } from "./dimona-actions";

export function DimonaReminderBanner({
  employeeId,
  employeeName,
  contractSignedAt,
  dimonaDone,
}: {
  employeeId: string;
  employeeName: string;
  contractSignedAt: string | null;
  dimonaDone: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!contractSignedAt) return null;
  if (dimonaDone) {
    return (
      <Card className="border-emerald-300 bg-emerald-50/40">
        <div className="px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <div className="text-xs text-emerald-900">
            <span className="font-bold">Dimona traitée</span> pour {employeeName}.
          </div>
        </div>
      </Card>
    );
  }

  function handleOpenPortal() {
    window.open("https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm", "_blank", "noopener,noreferrer");
    toast.info("Portail ONSS ouvert. Une fois la Dimona déclarée, clique \"Marquer Dimona traitée\".");
  }

  function handleMarkDone() {
    if (!confirm(`Confirmes-tu avoir déclaré la Dimona pour ${employeeName} sur le portail ONSS ?`)) return;
    startTransition(async () => {
      const res = await dimonaMarkDoneAction(employeeId);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Dimona marquée comme traitée. Notification archivée.");
      router.refresh();
    });
  }

  function handleAutoSubmit() {
    if (!confirm("Lancer l'Auto-Dimona via API ONSS ? (étape 2 - nécessite certificat technique)")) return;
    startTransition(async () => {
      const res = await dimonaAutoSubmitAction(employeeId);
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Dimona auto-soumise ! Période : ${res.dimonaPeriodId}`);
      router.refresh();
    });
  }

  return (
    <Card className="border-rose-400 bg-rose-50 ring-2 ring-rose-200">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <h2 className="font-bold text-sm text-rose-900">
              🚨 Dimona à déclarer en urgence
            </h2>
            <p className="text-xs text-rose-800 mt-1">
              <strong>{employeeName}</strong> a signé son contrat le{" "}
              <span className="font-mono">{new Date(contractSignedAt).toLocaleDateString("fr-BE")}</span>.
              La déclaration Dimona IN doit être faite <strong>avant le 1er jour de travail</strong>{" "}
              (obligation légale, sanctions ONSS si retard).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenPortal}
            disabled={pending}
            className="border-rose-400 text-rose-900 hover:bg-rose-100"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Ouvrir portail ONSS
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleAutoSubmit}
            disabled={pending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            title="Auto-Dimona via API ONSS (étape 2 - en développement)"
          >
            <Zap className="h-3.5 w-3.5" /> Auto-Dimona (étape 2)
          </Button>
          <span className="text-[10px] text-rose-700 italic">
            ⚠ Auto-Dimona nécessite certificat technique. Pour l&apos;instant, utiliser le portail manuel.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMarkDone}
            disabled={pending}
            className="ml-auto border-emerald-500 text-emerald-700 hover:bg-emerald-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Marquer Dimona traitée
          </Button>
        </div>
      </div>
    </Card>
  );
}
