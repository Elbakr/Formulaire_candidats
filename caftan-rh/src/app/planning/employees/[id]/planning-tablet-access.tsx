"use client";

// Karim 2026-07-09 (Phase 3) : bloc « Accès planning tablette » sur la fiche
// travailleur (admin/rh). Affiche le CODE PERSONNEL s'il existe + bouton
// Générer / régénérer. Le code sert au travailleur à consulter SON planning par
// défaut (lecture seule) sur la tablette partagée du magasin (page /tablette).
// Communiqué MANUELLEMENT au travailleur — AUCUN envoi automatique.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tablet, KeyRound, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generatePlanningAccessCodeAction } from "./planning-proposal-actions";

export function PlanningTabletAccessSection({
  employeeId,
  currentCode,
}: {
  employeeId: string;
  currentCode: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(currentCode);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function onGenerate() {
    const confirmMsg = code
      ? "Régénérer le code ? L'ancien code ne fonctionnera plus."
      : null;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    start(async () => {
      const r = await generatePlanningAccessCodeAction({ employeeId });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setCode(r.code ?? null);
      toast.success("Code généré. Communique-le au travailleur.");
      router.refresh();
    });
  }

  function onCopy() {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Copie impossible."),
    );
  }

  return (
    <Card>
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-1.5">
          <Tablet className="h-4 w-4 text-gold-dark" />
          Accès planning tablette
        </h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Code personnel à saisir sur la tablette du magasin (<code>/tablette</code>) pour consulter
          son planning par défaut en lecture seule. À communiquer au travailleur (aucun envoi auto).
        </p>
      </div>
      <div className="p-4 flex items-center gap-3 flex-wrap">
        {code ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2">
            <KeyRound className="h-4 w-4 text-gold-dark" />
            <span className="font-mono text-2xl font-bold tracking-[0.25em] text-ink select-all">
              {code}
            </span>
            <button
              type="button"
              onClick={onCopy}
              title="Copier le code"
              className="ml-1 text-ink-3 hover:text-gold-dark transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <span className="text-xs text-ink-3 italic">Aucun code pour l&apos;instant.</span>
        )}
        <Button variant={code ? "outline" : "gold"} size="sm" onClick={onGenerate} disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          {code ? "Régénérer le code" : "Générer le code"}
        </Button>
      </div>
    </Card>
  );
}
