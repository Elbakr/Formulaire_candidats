// Karim 2026-05-31 : composer mail manuel - cible un employee ou email libre,
// upload pièces jointes (Storage), envoi via EmailJS + archive outbound_mails.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { ComposeMailForm } from "./compose-form";

export const dynamic = "force-dynamic";

export default async function NewMailPage(props: { searchParams: Promise<{ to?: string }> }) {
  await requireRole(["admin", "rh"]);
  const { to: preselectId } = await props.searchParams;
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name, email")
    .in("status", ["active", "on_leave"])
    .order("full_name");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nouveau mail</h1>
        <p className="text-sm text-muted-foreground">
          Envoyé depuis <code>hr@caftanfactory.com</code> · Archivé dans Mails envoyés
        </p>
      </div>
      <ComposeMailForm
        employees={(employees ?? []) as Array<{ id: string; full_name: string; email: string | null }>}
        preselectEmployeeId={preselectId ?? null}
      />
    </div>
  );
}
