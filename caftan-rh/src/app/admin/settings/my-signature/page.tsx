// Karim 2026-05-29 : page pour stocker la signature de l employeur (Karim
// Elbazi pour AMD Megastore / Caftan Factory). Une fois stockee, tous les
// contrats sont pre-signes automatiquement avant envoi a l employee.

import Link from "next/link";
import { ArrowLeft, FileSignature, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SignatureEditor } from "./signature-editor";

export const dynamic = "force-dynamic";

export default async function MySignaturePage() {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("signature_data_url, signature_updated_at")
    .eq("id", profile.id)
    .maybeSingle();
  const row = (data as { signature_data_url: string | null; signature_updated_at: string | null } | null);
  const hasSignature = !!row?.signature_data_url;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-gold-dark" />
            Ma signature stockée
          </h1>
          <p className="text-sm text-ink-2">
            Stocke ta signature une seule fois. Tous les contrats envoyés via DocuSeal seront pré-signés côté employeur automatiquement — tu n&apos;auras plus à signer chaque envoi.
          </p>
        </div>
        <Link href="/admin/settings" className="text-xs px-3 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Paramètres
        </Link>
      </div>

      {hasSignature ? (
        <Card className="border-emerald-300 bg-emerald-50/30">
          <div className="px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div className="flex-1">
              <div className="text-sm font-bold text-emerald-800">Signature enregistrée</div>
              <div className="text-[11px] text-ink-3">
                Dernière mise à jour : {row?.signature_updated_at ? new Date(row.signature_updated_at).toLocaleString("fr-BE") : "—"}
              </div>
            </div>
          </div>
          <div className="p-3 border-t border-line bg-white">
            <div className="text-[10px] uppercase font-bold text-ink-3 mb-1">Aperçu</div>
            {row?.signature_data_url ? (
              <img src={row.signature_data_url} alt="Signature" className="max-h-32 border border-line rounded bg-white" />
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="border-amber-300 bg-amber-50/30">
          <div className="px-3 py-2 flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-amber-700" />
            <div className="text-sm text-amber-900">
              <span className="font-bold">Aucune signature enregistrée.</span> Dessine ou upload ta signature ci-dessous pour activer la pré-signature automatique.
            </div>
          </div>
        </Card>
      )}

      <SignatureEditor existing={row?.signature_data_url ?? null} userId={profile.id} />

      <Card>
        <div className="px-3 py-2 border-b border-line">
          <h3 className="font-bold text-sm">Comment ça marche</h3>
        </div>
        <div className="p-3 text-xs text-ink-2 space-y-2">
          <p>
            <span className="font-bold">1.</span> Dessine ta signature dans le cadre ci-dessus (souris/doigt) OU upload une image PNG/JPG transparente.
          </p>
          <p>
            <span className="font-bold">2.</span> Clique <span className="font-bold">Enregistrer</span>.
          </p>
          <p>
            <span className="font-bold">3.</span> À chaque envoi de contrat via le bouton <span className="font-bold">&quot;Envoyer à signer&quot;</span> sur une fiche employé, ta signature est automatiquement apposée sur le contrat avant envoi DocuSeal. L&apos;employé reçoit le contrat <span className="font-bold">déjà signé côté employeur</span> et n&apos;a plus qu&apos;à apposer la sienne.
          </p>
          <p className="text-amber-700 italic">
            ⚠ Tu peux modifier ta signature à tout moment. Les contrats déjà envoyés gardent l&apos;ancienne signature.
          </p>
        </div>
      </Card>
    </div>
  );
}
