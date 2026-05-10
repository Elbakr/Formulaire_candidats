import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewDmForm } from "./form";

export default async function NewDmPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data: profilesRaw } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .neq("id", profile.id)
    .order("full_name");
  const profiles = (profilesRaw ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string | null;
  }>;

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Nouveau message direct</h1>
        <p className="text-sm text-ink-2">
          Choisis un membre de l'équipe pour ouvrir une conversation privée.
        </p>
      </div>
      <Card>
        <div className="p-4">
          <NewDmForm profiles={profiles} />
        </div>
      </Card>
    </div>
  );
}
