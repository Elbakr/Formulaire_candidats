// Karim 2026-05-29 : page de configuration du provider de signature
// electronique. Liste les 3 options (internal/canvas, DocuSeal, DocuSign)
// avec comparatif et statut de configuration.

import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, ExternalLink, FileSignature } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SIGNATURE_PROVIDERS,
  getActiveSignatureProvider,
  isProviderConfigured,
  type SignatureProviderKey,
} from "@/lib/signature-providers";

export const dynamic = "force-dynamic";

export default async function SignatureSettingsPage() {
  await requireRole(["admin"]);
  const active = getActiveSignatureProvider();
  const providers = (["internal", "docuseal", "docusign"] as SignatureProviderKey[])
    .map((key) => ({
      ...SIGNATURE_PROVIDERS[key],
      isActive: active === key,
      isConfigured: isProviderConfigured(key),
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-gold-dark" />
            Provider de signature électronique
          </h1>
          <p className="text-sm text-ink-2">
            Choisis le moyen de signature des contrats. Par défaut : signature interne (gratuite).
          </p>
        </div>
        <Link href="/admin/settings" className="text-xs px-3 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Paramètres
        </Link>
      </div>

      <Card>
        <div className="px-3 py-2 border-b border-line">
          <p className="text-xs text-ink-2">
            Provider actif : <span className="font-bold text-gold-dark">{SIGNATURE_PROVIDERS[active].name}</span>
            {" "}— change via la variable d&apos;env <code className="text-[10px] bg-surface-2 px-1 py-0.5 rounded">SIGNATURE_PROVIDER</code> (valeur : <code className="text-[10px] bg-surface-2 px-1 py-0.5 rounded">internal</code> / <code className="text-[10px] bg-surface-2 px-1 py-0.5 rounded">docuseal</code> / <code className="text-[10px] bg-surface-2 px-1 py-0.5 rounded">docusign</code>).
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {providers.map((p) => (
          <Card key={p.key} className={p.isActive ? "border-gold ring-2 ring-gold/30" : ""}>
            <div className="px-3 py-2 border-b border-line flex items-center gap-2">
              <div className="flex-1">
                <h2 className="font-bold text-sm">{p.name}</h2>
                <div className="text-[10px] text-ink-3 mt-0.5">{p.pricing}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {p.isActive ? (
                  <Badge variant="rdv_done">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Actif
                  </Badge>
                ) : null}
                {p.isConfigured ? (
                  <Badge variant="rdv_done">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Configuré
                  </Badge>
                ) : (
                  <Badge variant="muted">
                    <AlertCircle className="h-2.5 w-2.5" /> Non configuré
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-3 space-y-3 text-xs">
              <div>
                <div className="font-bold text-[10px] uppercase tracking-wider text-ink-3 mb-1">Valeur légale</div>
                <p className="text-ink-2">{p.legalValue}</p>
              </div>
              <div>
                <div className="font-bold text-[10px] uppercase tracking-wider text-emerald-700 mb-1">Avantages</div>
                <ul className="space-y-0.5">
                  {p.pros.map((pro, i) => (
                    <li key={i} className="text-ink-2 text-[11px]">+ {pro}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-bold text-[10px] uppercase tracking-wider text-amber-700 mb-1">Limites</div>
                <ul className="space-y-0.5">
                  {p.cons.map((con, i) => (
                    <li key={i} className="text-ink-2 text-[11px]">− {con}</li>
                  ))}
                </ul>
              </div>
              {p.envVars.length > 0 ? (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-ink-3 mb-1">Variables d&apos;env requises</div>
                  <ul className="space-y-0.5">
                    {p.envVars.map((v, i) => (
                      <li key={i} className="text-[10px] font-mono text-ink-2">{v}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {p.setupUrl ? (
                <a
                  href={p.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
                >
                  Ouvrir le site <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="px-3 py-2 border-b border-line">
          <h3 className="font-bold text-sm">Recommandation Karim</h3>
        </div>
        <div className="p-3 text-xs text-ink-2 space-y-2">
          <p>
            <span className="font-bold">Pour la majorité des cas (CDD et Étudiant)</span> : reste sur <span className="font-bold text-emerald-700">Signature interne (canvas)</span>.
            C&apos;est gratuit, déjà fonctionnel, valable légalement (eIDAS Art. 25).
          </p>
          <p>
            <span className="font-bold">Si tu veux un upgrade gratuit avec meilleur design</span> : déploie <span className="font-bold text-blue-700">DocuSeal self-hosted</span> (1h via Docker).
            Open source, équivalent visuel DocuSign, gratuit à vie.
          </p>
          <p>
            <span className="font-bold">Pour les contrats sensibles ou litige potentiel</span> : <span className="font-bold text-amber-700">DocuSign Business Pro EU</span> (40€/mois) reste la référence QES.
            On peut activer cas par cas plutôt que pour tous.
          </p>
        </div>
      </Card>
    </div>
  );
}
