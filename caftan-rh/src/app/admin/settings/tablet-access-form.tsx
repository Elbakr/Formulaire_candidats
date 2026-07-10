"use client";

// Karim 2026-07-10 (Phase 3) : bloc admin « Accès tablette planning ».
// Affiche l'URL complète /t/<jeton> (secret d'appareil) à installer sur la
// tablette du magasin, avec copie 1-clic + génération/régénération du jeton.
// Régénérer invalide l'ancien lien (il faudra reconfigurer la tablette).

import { useState, useTransition } from "react";
import { Tablet, Copy, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { regenerateTabletDeviceTokenAction } from "./actions";

export function TabletAccessForm({
  initialToken,
  baseUrl,
}: {
  initialToken: string | null;
  baseUrl: string;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const fullUrl = token ? `${baseUrl}/t/${token}` : null;

  function regenerate() {
    if (pending) return;
    start(async () => {
      const r = await regenerateTabletDeviceTokenAction();
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setToken(r.token);
      setCopied(false);
      toast.success("Jeton d'appareil généré. Reconfigure la tablette avec le nouveau lien.");
    });
  }

  async function copy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Lien copié.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible. Sélectionne et copie le lien manuellement.");
    }
  }

  return (
    <div className="p-5 space-y-3 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
          <Tablet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm">Accès tablette planning</div>
          <p className="text-xs text-ink-3">
            La tablette partagée du magasin s&apos;ouvre sur un lien <strong>secret</strong>{" "}
            <code className="font-mono bg-surface-2 px-1 rounded">/t/&lt;jeton&gt;</code>. Sans ce
            jeton, la page est introuvable (404). Le travailleur saisit ensuite son{" "}
            <strong>code personnel</strong> pour voir son planning (double barrière).
          </p>
        </div>
      </div>

      {fullUrl ? (
        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs break-all">
              {fullUrl}
            </div>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
              aria-label="Copier le lien"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="text-[11px] text-ink-3">
            Installe ce lien sur la tablette du magasin (favori / écran d&apos;accueil).{" "}
            <strong>Ne le diffuse pas.</strong> Régénérer le jeton invalide l&apos;ancien lien.
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-3">
          Aucun jeton configuré : l&apos;accès tablette public est <strong>désactivé</strong>.
          Génère un jeton pour obtenir le lien à installer sur la tablette.
        </p>
      )}

      <Button type="button" variant="gold" onClick={regenerate} disabled={pending}>
        <RefreshCw className={`h-4 w-4 mr-1.5 ${pending ? "animate-spin" : ""}`} />
        {token ? "Régénérer le jeton d'appareil" : "Générer le jeton d'appareil"}
      </Button>
    </div>
  );
}
