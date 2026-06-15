"use client";

// Karim 2026-06-15 : barre de fermeture sticky pour l'aperçu / impression contrat.
// Utilisée dans contract-preview/page.tsx et contract-print/page.tsx (server components).
// Sur PWA iOS (standalone) il n'y a pas de barre navigateur → window.close() ou repli href.

import { useCallback } from "react";

interface CloseBarProps {
  /** Lien de repli si window.close() n'est pas permis (ex: '/planning/employees/123'). */
  fallbackHref: string;
  /** Nom de l'employé affiché dans le header. */
  title?: string;
  /** Texte secondaire (ex: nom du template). */
  subtitle?: string;
  /** Slot optionnel pour des boutons supplémentaires (ex: bouton Imprimer). */
  actions?: React.ReactNode;
  /** Affiche un bouton Imprimer / PDF (window.print()). */
  showPrintButton?: boolean;
  /** Cache la barre à l'impression (défaut true). */
  hidePrint?: boolean;
}

export default function CloseBar({
  fallbackHref,
  title,
  subtitle,
  actions,
  showPrintButton = false,
  hidePrint = true,
}: CloseBarProps) {
  const handleClose = useCallback(() => {
    // Tente de fermer l'onglet (fonctionne si ouvert via target="_blank" par un script).
    window.close();
    // Si window.close() n'a pas fermé la fenêtre (ex: ouvert directement par l'utilisateur),
    // on attend 300 ms puis on navigue vers le repli.
    setTimeout(() => {
      if (!window.closed) {
        window.location.href = fallbackHref;
      }
    }, 300);
  }, [fallbackHref]);

  return (
    <div
      className={[
        "sticky top-0 z-50 bg-white border-b shadow-sm",
        "flex items-center justify-between gap-3 px-4 py-2",
        hidePrint ? "print:hidden" : "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Infos employé */}
      <div className="min-w-0">
        {title && (
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
        )}
        {subtitle && (
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        )}
      </div>

      {/* Actions (slot) + bouton Imprimer optionnel + bouton Fermer */}
      <div className="flex items-center gap-2 shrink-0">
        {actions}

        {showPrintButton && (
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Imprimer ou exporter en PDF"
            className="
              inline-flex items-center gap-1.5
              min-h-[44px] px-4
              bg-blue-600 text-white
              text-sm font-semibold rounded-lg
              hover:bg-blue-700 active:bg-blue-800
              transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600
            "
          >
            🖨️ Imprimer / PDF
          </button>
        )}

        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer l'aperçu"
          className="
            inline-flex items-center gap-1.5
            min-h-[44px] px-4
            bg-gray-900 text-white
            text-sm font-semibold rounded-lg
            hover:bg-gray-700 active:bg-gray-600
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900
          "
        >
          <span aria-hidden="true">✕</span>
          Fermer l&apos;aperçu
        </button>
      </div>
    </div>
  );
}
