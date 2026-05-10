import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { BroadcastsClient } from "./client";

export default async function BroadcastsAdminPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: broadcastsRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("broadcasts")
      .select("id, title, body, audience_kind, audience_site_ids, priority, send_chat, send_email, send_whatsapp, sent_at, created_at, author_profile_id")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  const broadcasts = (broadcastsRaw ?? []) as Array<{
    id: string;
    title: string;
    body: string;
    audience_kind: string;
    audience_site_ids: string[] | null;
    priority: string;
    send_chat: boolean;
    send_email: boolean;
    send_whatsapp: boolean;
    sent_at: string | null;
    created_at: string;
    author_profile_id: string | null;
  }>;

  const sites = (sitesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
  }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Megaphone className="h-7 w-7 text-gold" />
        <div>
          <h1 className="text-2xl font-bold">Annonces broadcast</h1>
          <p className="text-sm text-ink-2">
            Diffuse une information importante à tous les magasins ou à un sous-ensemble.
          </p>
        </div>
      </div>

      {sites.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun site actif — crée d'abord les sites magasins (A→F) dans /planning/sites.
          </div>
        </Card>
      ) : null}

      <BroadcastsClient broadcasts={broadcasts} sites={sites} />
    </div>
  );
}
