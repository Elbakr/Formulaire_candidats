"use client";

// Karim 2026-07-11 : bouton fiche « Extraire & vérifier (IA) ». Lance l'extraction de
// la carte d'identité + le contrôle de conformité des documents, et affiche un récap
// (champs complétés, discordances à trancher, validité des documents).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Loader2, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { extractEmployeeIdAction, type ExtractEmployeeIdResult } from "./id-extract-actions";

export function IdExtractButton({ employeeId }: { employeeId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ExtractEmployeeIdResult | null>(null);
  const router = useRouter();

  function run() {
    start(async () => {
      try {
        const r = await extractEmployeeIdAction(employeeId);
        setRes(r);
        // Rafraîchit la fiche pour afficher les champs nouvellement complétés + états.
        router.refresh();
        if (!r.extractOk && r.docsChecked === 0) {
          toast.error(r.extractError ?? "Aucune donnée à extraire.");
        } else if (r.discordances.length > 0) {
          toast.warning(`${r.discordances.length} discordance(s) à vérifier.`);
        } else {
          toast.success("Extraction & vérification terminées.");
        }
      } catch {
        toast.error("Échec de l'extraction IA.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={pending} variant="outline" size="sm">
        {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1" />}
        Extraire &amp; vérifier (IA)
      </Button>

      {res ? (
        <div className="rounded-lg border border-line bg-surface p-3 text-[12px] space-y-2">
          {/* Extraction CI */}
          {res.extractOk ? (
            res.filled.length > 0 ? (
              <div className="flex items-start gap-1.5 text-emerald-800">
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{res.filled.length} champ(s) complété(s)</strong> depuis la carte : {res.filled.join(", ")}.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-1.5 text-ink-2">
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                <span>Carte lue : aucun champ manquant à compléter.</span>
              </div>
            )
          ) : (
            <div className="flex items-start gap-1.5 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{res.extractError ?? "Carte non lue."}</span>
            </div>
          )}

          {/* Discordances — à trancher (jamais écrasé automatiquement) */}
          {res.discordances.length > 0 ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Discordances (fiche ≠ carte — non modifié)
              </div>
              <ul className="space-y-0.5">
                {res.discordances.map((d, i) => (
                  <li key={i} className="text-amber-900">
                    <strong>{d.field}</strong> : fiche « {d.existing} » vs carte « {d.extracted} »
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {res.workAuthorization ? (
            <div className="text-ink-2">
              Droit au travail (calculé) : <strong>{res.workAuthorization}</strong>
            </div>
          ) : null}

          {/* Conformité documents */}
          {res.docsChecked > 0 ? (
            <div className="flex items-start gap-1.5 text-ink-2 pt-1 border-t border-line/60">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gold-dark" />
              <span>
                Documents vérifiés : <strong>{res.docsChecked}</strong> — {res.docsConform} conforme(s)
                {res.docsIssues > 0 ? `, ${res.docsIssues} à vérifier` : ""}.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
