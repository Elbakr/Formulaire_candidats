"use client";

// Karim 2026-05-31 (task #71) : indicateur visuel de complétion de la fiche
// employee, façon GAFAM/Linear. Barre de progression + nombre de champs manquants.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Mail, Edit3 } from "lucide-react";
import { getMissingFields, completionPercent, type MissingField } from "@/lib/contract-readiness";

export function CompletionBar({
  employeeRecord,
  contractType,
}: {
  employeeRecord: Record<string, unknown>;
  contractType: string | null;
}) {
  const missing = useMemo(() => getMissingFields(employeeRecord, contractType), [employeeRecord, contractType]);
  const pct = useMemo(() => completionPercent(employeeRecord, contractType), [employeeRecord, contractType]);
  const [expanded, setExpanded] = useState(false);

  const isReady = missing.length === 0;
  const missingCandidate = missing.filter((m) => !m.adminOnly);
  const missingAdmin = missing.filter((m) => m.adminOnly);

  // Couleur de la barre selon completion
  const barColor =
    pct >= 100 ? "bg-green-500" :
    pct >= 75 ? "bg-blue-500" :
    pct >= 50 ? "bg-amber-500" :
    "bg-red-500";

  const statusText =
    pct >= 100 ? "Fiche complète" :
    pct >= 75 ? "Presque prête" :
    pct >= 50 ? "À compléter" :
    "Beaucoup de champs manquants";

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Icone status */}
        {isReady ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        ) : (
          <AlertCircle className={`w-5 h-5 flex-shrink-0 ${pct >= 50 ? "text-amber-600" : "text-red-600"}`} />
        )}

        {/* Texte + barre */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-sm font-semibold">{statusText}</span>
            <span className="text-xs font-mono text-ink-3">{pct}%</span>
          </div>
          <div className="h-1.5 bg-line rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!isReady && (
            <div className="text-[11px] text-ink-3 mt-1">
              {missing.length} champ{missing.length > 1 ? "s" : ""} manquant{missing.length > 1 ? "s" : ""}
              {missingCandidate.length > 0 && (
                <> · <span className="text-amber-700">{missingCandidate.length} côté candidat</span></>
              )}
              {missingAdmin.length > 0 && (
                <> · <span className="text-red-700">{missingAdmin.length} côté admin</span></>
              )}
            </div>
          )}
        </div>

        {/* Chevron expand */}
        {!isReady && (
          expanded ? <ChevronUp className="w-4 h-4 text-ink-3 flex-shrink-0" />
                   : <ChevronDown className="w-4 h-4 text-ink-3 flex-shrink-0" />
        )}
      </button>

      {/* Liste détaillée si expanded */}
      {expanded && !isReady && (
        <div className="border-t border-line px-3 py-3 bg-muted/20 space-y-3">
          {missingCandidate.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800 mb-1.5">
                <Mail className="w-3 h-3" /> À demander au candidat ({missingCandidate.length})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {missingCandidate.map((m) => <MissingPill key={m.key} m={m} type="candidate" />)}
              </div>
            </div>
          )}
          {missingAdmin.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-red-800 mb-1.5">
                <Edit3 className="w-3 h-3" /> Admin/RH à compléter sur la fiche ({missingAdmin.length})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {missingAdmin.map((m) => <MissingPill key={m.key} m={m} type="admin" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MissingPill({ m, type }: { m: MissingField; type: "admin" | "candidate" }) {
  const bg = type === "admin" ? "bg-red-50 border-red-200 text-red-900" : "bg-amber-50 border-amber-200 text-amber-900";
  return (
    <div className={`text-[11px] px-2 py-1 rounded border ${bg} flex items-center gap-1`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      <span className="truncate">{m.label}</span>
    </div>
  );
}
