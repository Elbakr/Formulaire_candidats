import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";

export default async function WhatsAppTemplatesPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .order("slug");

  type Row = {
    id: string;
    slug: string;
    language_code: string;
    category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
    body: string;
    variables_count: number;
    twilio_content_sid: string | null;
    status: "draft" | "pending" | "approved" | "rejected";
    is_active: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };

  const templates = (data ?? []) as Row[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/integrations/whatsapp">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Templates WhatsApp (HSM)</h1>
          <p className="text-sm text-ink-2">
            Templates approuvés par Meta Business — obligatoires pour démarrer une conversation
            hors fenêtre de 24 h.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 text-sm leading-relaxed space-y-2 bg-warn-light/40">
          <p className="font-bold">Avant d&apos;envoyer en production :</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Crée le template ici (status = <code>draft</code>).</li>
            <li>
              Soumets-le dans Twilio Console → <em>Messaging → Content Editor</em>. Le corps
              <strong> doit être identique mot pour mot</strong> à celui ci-dessus.
            </li>
            <li>
              Twilio le transmet à Meta. Délai d&apos;approval : 24 à 48 h. Status passe à
              <code> approved</code>.
            </li>
            <li>
              Récupère le <code>Content SID</code> (HX…) dans la console Twilio, colle-le ici, et
              passe le statut local à <code>approved</code>.
            </li>
            <li>Le template est alors utilisable depuis la fiche candidat.</li>
          </ol>
          <p className="text-[12px] text-ink-2 pt-2 border-t border-line">
            <strong>Garde-fou :</strong> les variables <code>{`{{1}}`}</code>, <code>{`{{2}}`}</code>… doivent
            apparaître dans le texte exactement comme ce que tu fais valider. Si l&apos;utilisateur fournit le
            mauvais nombre de variables au moment de l&apos;envoi, l&apos;action est rejetée avant Twilio.
          </p>
        </div>
      </Card>

      <TemplatesClient templates={templates} />
    </div>
  );
}
