import Link from "next/link";
import { CalendarOff, ChevronRight, MapPin, Sliders, Bell, Store, CalendarHeart, Snowflake, Cpu } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { pushIsConfigured } from "@/lib/push-notify";

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("org_settings").select("*").eq("id", 1).maybeSingle();
  const pushReady = pushIsConfigured();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-ink-2">Configuration globale de l'organisation.</p>
      </div>

      {!pushReady ? (
        <Card className="border-l-4 border-l-warn">
          <div className="p-3 sm:p-4 flex items-start gap-3">
            <Bell className="h-5 w-5 text-warn shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-bold">Notifications push non configurées</div>
              <div className="text-xs text-ink-2 mt-0.5">
                Pour activer les notifications push (renforts, absences,
                Dimona), génère une paire VAPID via la commande{" "}
                <code className="font-mono bg-surface-2 px-1 rounded">
                  npm run vapid:generate
                </code>{" "}
                puis ajoute les 4 lignes affichées dans{" "}
                <code className="font-mono bg-surface-2 px-1 rounded">
                  caftan-rh/.env.local
                </code>{" "}
                et redémarre le serveur dev. Sans ces clés, le système continue
                de fonctionner mais les push restent muets.
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border-l-4 border-l-success">
          <div className="p-3 flex items-center gap-3">
            <Bell className="h-4 w-4 text-success" />
            <div className="text-sm font-bold">Notifications push armées</div>
            <div className="text-xs text-ink-3 ml-auto">
              VAPID configuré
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 bg-surface-2">
          Rubriques liées (édition dans l'onglet concerné)
        </div>
        <Link
          href="/planning/sites"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors border-b border-line"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <Store className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Magasins · besoins · horaires d'ouverture</div>
            <div className="text-xs text-ink-3">
              Édite les créneaux par site (besoins hebdo, on/off, critique). Les horaires d'ouverture du magasin se déduisent des besoins.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
        <Link
          href="/admin/holidays"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors border-b border-line"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <CalendarHeart className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Jours fériés · politique magasins · effectif</div>
            <div className="text-xs text-ink-3">
              Magasin fermé/ouvert par jour, multiplicateur d'effectif (rush Aïd, soldes).
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
        <Link
          href="/admin/seasonal"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <Snowflake className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Périodes saisonnières · rush</div>
            <div className="text-xs text-ink-3">
              Ramadan, soldes, fin d'année — multiplicateurs et exigences spécifiques.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
      </Card>

      <Card>
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 bg-surface-2">
          Réglages centralisés
        </div>
        <Link
          href="/admin/settings/autoplaner-rules"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors border-b border-line"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Règles de l'autoplaner</div>
            <div className="text-xs text-ink-3">
              Crescendo fêtes, ponts, priorité managers, fractionnement OT,
              validations rush… ~30 règles toggables (plumbed ou documentation).
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
        <Link
          href="/admin/settings/leave-rules"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors border-b border-line"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <CalendarOff className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Auto-validation des congés</div>
            <div className="text-xs text-ink-3">
              Préavis, % absents max, durée max, périodes interdites.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
        <Link
          href="/admin/settings/kpi-weights"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors border-b border-line"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <Sliders className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Pondération KPI</div>
            <div className="text-xs text-ink-3">
              Ponctualité, fiabilité, heures, absences, note hebdo, ventes — total = 100.
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
        <Link
          href="/admin/settings/geofence"
          className="flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors"
        >
          <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Géofence pointage</div>
            <div className="text-xs text-ink-3">
              Rayon autour de chaque site, mode strict (refus si hors zone).
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-3" />
        </Link>
      </Card>

      <Card>
        <SettingsForm
          initial={
            (data as unknown as {
              org_name: string;
              email_signature: string | null;
              timezone: string;
              default_language: string;
              logo_url: string | null;
              prayer_pause_enabled: boolean | null;
              prayer_pause_summer: string | null;
              prayer_pause_winter: string | null;
              prayer_pause_dst_start: string | null;
              prayer_pause_dst_end: string | null;
            }) ?? {
              org_name: "CaftanRH",
              email_signature: "",
              timezone: "Europe/Brussels",
              default_language: "fr-BE",
              logo_url: "",
              prayer_pause_enabled: true,
              prayer_pause_summer: "13:55-14:45",
              prayer_pause_winter: "12:55-13:45",
              prayer_pause_dst_start: "04-01",
              prayer_pause_dst_end: "10-01",
            }
          }
        />
      </Card>
    </div>
  );
}
