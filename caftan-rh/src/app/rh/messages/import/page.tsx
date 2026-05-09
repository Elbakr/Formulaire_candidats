import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImportEmailForm } from "./form";

export default async function ImportEmailPage() {
  await requireRole(["admin", "rh", "manager"]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/rh/messages"><ArrowLeft className="h-3.5 w-3.5" /> Retour messagerie</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6 text-gold-dark" /> Importer un email
        </h1>
        <p className="text-sm text-ink-2 mt-1 max-w-2xl">
          Copie-colle ici un email reçu en réponse d&apos;un candidat. La plateforme va le rattacher
          automatiquement à son dossier (par adresse email, par tag <code>[#APP-xxx]</code>, ou par
          nom). S&apos;il n&apos;est pas matché, il ira dans le bucket{" "}
          <Link href="/rh/messages/unmatched" className="text-gold-dark font-bold hover:underline">À attribuer</Link>.
        </p>
      </div>

      <Card>
        <div className="p-5">
          <ImportEmailForm />
        </div>
      </Card>

      <Card>
        <div className="p-4 text-xs text-ink-2 leading-relaxed">
          <div className="font-bold uppercase tracking-wider text-ink-3 mb-2">💡 Comment récupérer un email</div>
          <ol className="list-decimal list-inside space-y-1">
            <li>Ouvre l&apos;email dans Gmail</li>
            <li>Clique le menu ⋮ en haut à droite du message → <strong>&laquo; Afficher l&apos;original &raquo;</strong></li>
            <li>Une nouvelle fenêtre s&apos;ouvre avec le contenu brut (.eml)</li>
            <li>Clique <strong>&laquo; Copier dans le presse-papiers &raquo;</strong> ou sélectionne tout (Ctrl+A) puis copie (Ctrl+C)</li>
            <li>Reviens ici, colle dans la zone <strong>Raw .eml</strong> et clique &laquo; Importer &raquo;</li>
          </ol>
          <p className="mt-3 text-ink-3">
            Alternative plus simple : utilise le mode <strong>Manuel</strong> et remplis juste les
            4 champs (From, Sujet, Corps, Date) en copiant-collant chaque info séparément.
          </p>
        </div>
      </Card>
    </div>
  );
}
