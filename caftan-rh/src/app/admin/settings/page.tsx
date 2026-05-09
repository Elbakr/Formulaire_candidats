import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("org_settings").select("*").eq("id", 1).single();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-ink-2">Configuration globale de l'organisation.</p>
      </div>
      <Card>
        <SettingsForm
          initial={
            (data as unknown as {
              org_name: string;
              email_signature: string | null;
              timezone: string;
              default_language: string;
              logo_url: string | null;
            }) ?? {
              org_name: "CaftanRH",
              email_signature: "",
              timezone: "Europe/Brussels",
              default_language: "fr-BE",
              logo_url: "",
            }
          }
        />
      </Card>
    </div>
  );
}
