import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { listEmployerOrgs } from "@/lib/employer-orgs";
import { Button } from "@/components/ui/button";
import { EntitiesEditor } from "./entities-editor";

export const dynamic = "force-dynamic";

export default async function AdminEntitiesPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const orgs = await listEmployerOrgs(admin);
  const { data: sitesRaw } = await admin
    .from("sites")
    .select("id, code, name, city, employer_org_key, is_active")
    .order("code");
  const sites = (sitesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    city: string | null;
    employer_org_key: string | null;
    is_active: boolean;
  }>;

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gold-dark" />
            Entités &amp; sites
          </h1>
          <p className="text-sm text-ink-2">
            Coordonnées, adresse et <strong>libellé de signature</strong> de chaque entité (employeur),
            et rattachement des sites. Les contrats et conventions de rupture sont signés par l&apos;entité
            du site du travailleur. Modifications enregistrées automatiquement.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin"><ArrowLeft className="h-3.5 w-3.5" /> Retour</Link>
        </Button>
      </div>

      <EntitiesEditor orgs={orgs} sites={sites} />
    </div>
  );
}
