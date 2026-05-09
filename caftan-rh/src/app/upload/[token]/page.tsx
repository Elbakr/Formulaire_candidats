// Public route — pas de login requis. Validation du token côté serveur.
// Si valide : page d'upload pour le candidat / employé.
// Si invalide / expiré : message d'erreur + contact.

import { validateToken } from "@/lib/documents/tokens";
import { getCatalog } from "@/lib/documents/catalog";
import { createAdminClient } from "@/lib/supabase/server";
import { firstNameOf } from "@/lib/email-templates";
import { Card } from "@/components/ui/card";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage(props: PageProps<"/upload/[token]">) {
  const { token } = await props.params;
  const tokenRow = await validateToken(token);

  // Récupère contact info de l'org
  const admin = createAdminClient();
  const { data: orgRaw } = await admin
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp")
    .eq("id", 1)
    .single();
  const org = (orgRaw ?? {}) as {
    org_name?: string;
    org_email?: string;
    org_phone?: string;
    org_whatsapp?: string;
  };

  if (!tokenRow) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 space-y-3">
          <div className="text-2xl font-bold">Lien invalide ou expiré</div>
          <p className="text-sm text-ink-2">
            Ce lien d&apos;upload n&apos;est plus valide. Il a peut-être déjà été utilisé,
            a expiré, ou a été révoqué.
          </p>
          <p className="text-sm text-ink-2">
            Pour obtenir un nouveau lien, contacte{" "}
            <strong>{org.org_name ?? "notre équipe RH"}</strong> :
          </p>
          <ul className="text-sm text-ink-2 space-y-1">
            {org.org_email ? (
              <li>
                Email :{" "}
                <a href={`mailto:${org.org_email}`} className="text-gold-dark underline">
                  {org.org_email}
                </a>
              </li>
            ) : null}
            {org.org_phone ? <li>Téléphone : {org.org_phone}</li> : null}
            {org.org_whatsapp ? (
              <li>
                WhatsApp :{" "}
                <a
                  href={`https://wa.me/${org.org_whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-dark underline"
                >
                  {org.org_phone ?? org.org_whatsapp}
                </a>
              </li>
            ) : null}
          </ul>
        </Card>
      </div>
    );
  }

  // Récupère le label du document + nom du candidat/employé
  const catalog = tokenRow.doc_slug ? await getCatalog(tokenRow.doc_slug) : null;

  let firstName: string | null = null;
  if (tokenRow.candidate_id) {
    const { data: c } = await admin
      .from("candidates")
      .select("full_name")
      .eq("id", tokenRow.candidate_id)
      .maybeSingle();
    const cr = c as unknown as { full_name: string } | null;
    if (cr) firstName = firstNameOf(cr.full_name);
  } else if (tokenRow.employee_id) {
    const { data: e } = await admin
      .from("employees")
      .select("full_name")
      .eq("id", tokenRow.employee_id)
      .maybeSingle();
    const er = e as unknown as { full_name: string } | null;
    if (er) firstName = firstNameOf(er.full_name);
  }

  const expiresAt = new Date(tokenRow.expires_at);
  const remainingDays = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000),
  );

  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-6 space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">
            {org.org_name ?? "CaftanRH"}
          </div>
          <div className="text-2xl font-bold mt-1">
            {firstName ? `Bonjour ${firstName} 👋` : "Téléversement de document"}
          </div>
        </div>

        <div className="bg-gold-light/40 border border-gold-light rounded-md p-3 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-gold-dark">
            Document demandé
          </div>
          <div className="text-base font-bold">{catalog?.label ?? "Document"}</div>
          {catalog?.description ? (
            <div className="text-xs text-ink-2">{catalog.description}</div>
          ) : null}
          {tokenRow.hint ? (
            <div className="text-xs text-ink-2 italic mt-1">💡 {tokenRow.hint}</div>
          ) : null}
        </div>

        <UploadForm token={token} docLabel={catalog?.label ?? "Document"} />

        <p className="text-[10px] text-ink-3 text-center">
          Lien valable encore {remainingDays} jour{remainingDays > 1 ? "s" : ""}.
          Aucune connexion requise — tes données sont chiffrées et seul le service RH y a accès.
        </p>
      </Card>
    </div>
  );
}
