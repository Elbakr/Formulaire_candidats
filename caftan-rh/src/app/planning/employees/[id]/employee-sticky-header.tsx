"use client";

// Karim 2026-05-31 (task #66) : header sticky moderne style Linear/Notion
// pour la fiche employee. Avatar + nom + status + completion + actions.

import { useEffect, useState } from "react";
import Link from "next/link";
import { NameAvatar } from "@/components/ui/avatar";
import { ArrowLeft } from "lucide-react";
import { completionPercent } from "@/lib/contract-readiness";

export function EmployeeStickyHeader({
  employeeId,
  fullName,
  status,
  contractType,
  jobTitle,
  employeeRecord,
}: {
  employeeId: string;
  fullName: string;
  status: string;
  contractType: string | null;
  jobTitle: string | null;
  employeeRecord: Record<string, unknown>;
}) {
  const [scrolled, setScrolled] = useState(false);
  const pct = completionPercent(employeeRecord, contractType);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const statusColor: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-green-100", text: "text-green-800", label: "Actif" },
    on_leave: { bg: "bg-amber-100", text: "text-amber-800", label: "En congé" },
    archived: { bg: "bg-gray-200", text: "text-gray-700", label: "Archivé" },
    pending: { bg: "bg-blue-100", text: "text-blue-800", label: "En attente" },
  };
  const st = statusColor[status] ?? { bg: "bg-gray-100", text: "text-gray-800", label: status };

  const compColor = pct >= 100 ? "text-green-600" : pct >= 75 ? "text-blue-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
  const compBg = pct >= 100 ? "bg-green-500" : pct >= 75 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className={`sticky top-0 z-40 -mx-4 px-4 transition-all duration-200 ${
        scrolled ? "bg-surface/95 backdrop-blur-md border-b border-line shadow-sm" : "bg-transparent"
      }`}
    >
      <div className={`flex items-center gap-3 transition-all ${scrolled ? "py-2" : "py-3"}`}>
        {/* Retour */}
        <Link
          href="/planning/employees"
          className="p-1.5 rounded hover:bg-muted text-ink-3 hover:text-ink-1 transition-colors"
          title="Retour à la liste"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        {/* Avatar */}
        <NameAvatar name={fullName} className={scrolled ? "h-8 w-8" : "h-10 w-10"} />

        {/* Identité */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className={`font-bold truncate ${scrolled ? "text-base" : "text-lg"}`}>{fullName}</h1>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>
              {st.label}
            </span>
            {contractType && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/5 text-ink-2 font-mono">
                {contractType}
              </span>
            )}
          </div>
          {!scrolled && jobTitle && (
            <div className="text-xs text-ink-3 mt-0.5 truncate">{jobTitle}</div>
          )}
        </div>

        {/* Completion donut (visible si scrolled) */}
        <div className="flex items-center gap-2">
          <div className={`text-right ${scrolled ? "hidden md:block" : ""}`}>
            <div className={`text-xs font-bold ${compColor}`}>{pct}%</div>
            <div className="text-[9px] text-ink-3">complétion</div>
          </div>
          {/* Mini circular progress */}
          <div className="relative w-10 h-10 flex-shrink-0">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="none" className="text-line" />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${(pct / 100) * 100.5} 100.5`}
                strokeLinecap="round"
                className={compColor}
              />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold ${compColor}`}>
              {pct === 100 ? "✓" : pct}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
