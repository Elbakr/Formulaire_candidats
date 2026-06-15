"use client";

// Karim 2026-06-15 : encart "Cohérence fiche ↔ contrat" sur la fiche employé admin.
// S'il n'y a pas de discordances, le composant ne rend rien.
// S'il y en a, affiche un tableau :
//   Champ | Valeur fiche (barrée) | Valeur cible (input éditableéditables, pré-rempli contrat)
// Bouton "Aligner la fiche" → appelle alignProfileToContractAction avec les valeurs
// actuelles des inputs (ajustées ou non par l'opérateur).
// Thème clair uniquement (jamais dark:). Texte FR.

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractDiscrepancy } from "@/lib/contract-render-inputs";
import { alignProfileToContractAction } from "./align-profile-actions";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Renvoie le type d'input HTML adapté au champ. */
function inputTypeFor(field: string): string {
  if (field === "weekly_hours" || field === "hourly_rate") return "number";
  if (field === "start_date" || field === "end_date") return "date";
  return "text";
}

/** Renvoie les attributs min/step pour les inputs numériques. */
function numAttrsFor(field: string): Record<string, string | number> {
  if (field === "weekly_hours") return { min: 1, max: 48, step: 0.5 };
  if (field === "hourly_rate") return { min: 0.01, step: 0.01 };
  return {};
}

// ─── Composant ──────────────────────────────────────────────────────────────

export function AlignProfileCard({
  employeeId,
  discrepancies,
}: {
  employeeId: string;
  discrepancies: ContractDiscrepancy[];
}) {
  // État local : valeurs des inputs (clé = field, valeur = string courant).
  // Initialisé avec les valeurs du contrat — l'opérateur peut les ajuster.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(discrepancies.map((d) => [d.field, d.contractValue])),
  );
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (discrepancies.length === 0 || done) return null;

  function handleChange(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleAlign() {
    startTransition(async () => {
      // Pour weekly_hours : dérive work_time_kind automatiquement si l'opérateur
      // n'a pas de champ séparé pour work_time_kind dans les discordances.
      const overrides: Record<string, string> = { ...values };

      // Si weekly_hours est dans les overrides, recalcule work_time_kind
      // sauf si work_time_kind est déjà une discordance explicite (il sera
      // dans values et envoyé tel quel).
      if (
        overrides.weekly_hours !== undefined &&
        overrides.work_time_kind === undefined
      ) {
        const h = parseFloat(overrides.weekly_hours);
        if (!isNaN(h)) {
          overrides.work_time_kind = h < 38 ? "partial" : "full";
        }
      }

      const result = await alignProfileToContractAction(employeeId, overrides);
      if ("ok" in result && result.ok) {
        toast.success("Fiche mise à jour. Les valeurs ont été alignées sur le contrat.");
        setDone(true);
      } else {
        toast.error(("error" in result ? result.error : null) ?? "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      {/* En-tête */}
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Cohérence fiche ↔ contrat
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {discrepancies.length} champ{discrepancies.length > 1 ? "s" : ""} diverge
            {discrepancies.length > 1 ? "nt" : ""} entre la fiche et le dernier contrat
            préparé. Ajustez si nécessaire, puis confirmez.
          </p>
        </div>
      </div>

      {/* Tableau des discordances */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-amber-800">
              <th className="pb-1 pr-3 font-semibold">Champ</th>
              <th className="pb-1 pr-3 font-semibold">Fiche actuelle</th>
              <th className="pb-1 font-semibold">Valeur cible (modifiable)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {discrepancies.map((d) => (
              <tr key={d.field} className="align-middle">
                <td className="py-1.5 pr-3 font-medium text-amber-900 whitespace-nowrap">
                  {d.label}
                </td>
                <td className="py-1.5 pr-3 text-ink-3">
                  <span className="line-through decoration-red-400">
                    {d.profileValue}
                  </span>
                </td>
                <td className="py-1.5">
                  {d.field === "work_time_kind" ? (
                    // Champ sélecteur pour le régime horaire
                    <select
                      value={values[d.field] ?? d.contractValue}
                      onChange={(e) => handleChange(d.field, e.target.value)}
                      className="border border-amber-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    >
                      <option value="full">temps plein</option>
                      <option value="partial">temps partiel</option>
                    </select>
                  ) : (
                    <Input
                      type={inputTypeFor(d.field)}
                      value={values[d.field] ?? d.contractValue}
                      onChange={(e) => handleChange(d.field, e.target.value)}
                      className="h-7 text-xs w-40 border-amber-300 bg-white focus-visible:ring-amber-400"
                      {...numAttrsFor(d.field)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Note d'information weekly_hours → régime */}
      {discrepancies.some((d) => d.field === "weekly_hours") && (
        <p className="text-[10px] text-amber-700 bg-amber-100 rounded px-2 py-1">
          Astuce : si vous mettez 24 h, le régime sera automatiquement défini
          sur &laquo;&nbsp;temps partiel&nbsp;&raquo; (seuil &lt; 38 h).
        </p>
      )}

      {/* Bouton confirmation */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          onClick={handleAlign}
          disabled={pending}
          className="bg-amber-600 hover:bg-amber-700 text-white border-0"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          )}
          Aligner la fiche
        </Button>
        <span className="text-[10px] text-amber-700">
          Vous décidez — l&apos;app n&apos;écrit que ce que vous validez.
        </span>
      </div>
    </div>
  );
}
