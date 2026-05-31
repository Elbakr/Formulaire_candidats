"use client";

// Karim 2026-05-30 : banner rouge clignotant en haut de la fiche employee
// listant les champs manquants. Distingue admin-only vs candidate.

import { AlertOctagon, Mail, Edit3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getMissingFields, completionPercent, type MissingField } from "@/lib/contract-readiness";

export function MissingFieldsBanner({
  employeeRecord,
  contractType,
}: {
  employeeRecord: Record<string, unknown>;
  contractType: string | null;
}) {
  const missing = getMissingFields(employeeRecord, contractType);
  if (missing.length === 0) return null;
  const pct = completionPercent(employeeRecord, contractType);
  const missingCandidate = missing.filter((m) => !m.adminOnly);
  const missingAdmin = missing.filter((m) => m.adminOnly);

  return (
    <Card className="border-red-400 border-2 bg-red-50 animate-pulse-slow">
      <div className="p-4 flex items-start gap-3">
        <AlertOctagon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-red-900">
            Fiche incomplète — {missing.length} champ{missing.length > 1 ? "s" : ""} manquant{missing.length > 1 ? "s" : ""} ({pct}% rempli)
          </h3>
          <p className="text-xs text-red-800 mt-1">
            Le contrat ne peut pas être envoyé à signer tant que tous les champs ci-dessous ne sont pas remplis.
          </p>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {missingCandidate.length > 0 && (
              <div className="bg-white border border-red-300 rounded p-2">
                <div className="flex items-center gap-1 text-[11px] font-bold text-red-700 mb-1">
                  <Mail className="w-3 h-3" /> À demander au candidat ({missingCandidate.length})
                </div>
                <ul className="text-xs text-red-900 space-y-0.5">
                  {missingCandidate.map((m) => (
                    <li key={m.key}>• {m.label}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-red-700 italic mt-1">
                  Utilise le bouton orange &quot;Demander N infos au candidat&quot;.
                </p>
              </div>
            )}
            {missingAdmin.length > 0 && (
              <div className="bg-white border border-red-300 rounded p-2">
                <div className="flex items-center gap-1 text-[11px] font-bold text-red-700 mb-1">
                  <Edit3 className="w-3 h-3" /> Admin/RH à compléter ({missingAdmin.length})
                </div>
                <ul className="text-xs text-red-900 space-y-0.5">
                  {missingAdmin.map((m) => (
                    <li key={m.key}>• {m.label}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-red-700 italic mt-1">
                  Complète directement dans le formulaire ci-dessous.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes pulseSlowBg {
          0%, 100% { background-color: rgb(254 242 242); }
          50% { background-color: rgb(254 226 226); }
        }
        :global(.animate-pulse-slow) {
          animation: pulseSlowBg 2s ease-in-out infinite;
        }
      `}</style>
    </Card>
  );
}

/** Karim 2026-05-30 : retourne la liste des keys manquantes pour styling form */
export function useMissingKeys(employeeRecord: Record<string, unknown>, contractType: string | null): Set<string> {
  return new Set(getMissingFields(employeeRecord, contractType).map((m) => m.key));
}
