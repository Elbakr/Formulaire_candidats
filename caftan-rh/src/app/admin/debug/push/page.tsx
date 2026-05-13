import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { getPublicVapidKey, pushIsConfigured } from "@/lib/push-notify";
import { PushDebugClient } from "./push-debug-client";

export const dynamic = "force-dynamic";

export default async function PushDebugPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: subsRaw } = await supabase
    .from("push_subscriptions")
    .select(`id, profile_id, user_agent, is_active, created_at, last_used_at,
             profile:profiles(email, full_name, role)`)
    .order("created_at", { ascending: false })
    .limit(30);
  const subs = (subsRaw ?? []) as unknown as Array<{
    id: string;
    profile_id: string;
    user_agent: string | null;
    is_active: boolean;
    created_at: string;
    last_used_at: string | null;
    profile: { email: string; full_name: string | null; role: string } | null;
  }>;

  const vapidPublic = getPublicVapidKey();
  const isConfigured = pushIsConfigured();

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Debug push notifications</h1>
        <p className="text-sm text-ink-2">
          Diagnostic complet du pipeline push : VAPID, service worker, abonnements.
        </p>
      </div>

      <Card>
        <div className="p-4 space-y-2">
          <h2 className="font-bold">Côté serveur</h2>
          <ul className="text-sm space-y-1">
            <li>
              VAPID configuré :{" "}
              {isConfigured ? (
                <span className="text-success font-bold">✓ Oui</span>
              ) : (
                <span className="text-danger font-bold">✗ NON — manque VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY</span>
              )}
            </li>
            <li>
              Clé publique exposée au navigateur :{" "}
              {vapidPublic ? (
                <span className="text-success font-bold">✓ Oui ({vapidPublic.slice(0, 12)}...)</span>
              ) : (
                <span className="text-danger font-bold">✗ NON</span>
              )}
            </li>
            <li>
              Subscriptions actives en DB :{" "}
              <span className="font-bold">{subs.filter((s) => s.is_active).length}</span>{" "}
              (total enregistrées : {subs.length})
            </li>
          </ul>
        </div>
      </Card>

      <PushDebugClient publicKey={vapidPublic} />

      <Card>
        <div className="p-4">
          <h2 className="font-bold mb-2">Abonnements (push_subscriptions)</h2>
          {subs.length === 0 ? (
            <p className="text-sm text-ink-3 italic">
              Aucun abonnement. Le bouton "Activer maintenant" ci-dessus enregistrera ce navigateur.
            </p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {subs.map((s) => (
                <li key={s.id} className="py-2 flex items-start gap-3 flex-wrap">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-1.5 rounded ${
                      s.is_active ? "bg-success-light text-success" : "bg-surface-2 text-ink-3"
                    }`}
                  >
                    {s.is_active ? "actif" : "inactif"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">
                      {s.profile?.full_name ?? s.profile?.email ?? "?"}{" "}
                      <span className="text-[10px] text-ink-3 font-normal">
                        ({s.profile?.role ?? "?"})
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-3 truncate">
                      {s.user_agent ?? "—"}
                    </div>
                    <div className="text-[10px] text-ink-3">
                      Crée {new Date(s.created_at).toLocaleString("fr-BE")}
                      {s.last_used_at ? ` · Dernier push ${new Date(s.last_used_at).toLocaleString("fr-BE")}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
