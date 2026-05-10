import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WhatsAppSettingsForm, type WhatsAppSettingsInitial } from "./settings-form";
import { WhatsAppTestButton } from "./test-button";
import {
  WhatsAppComplianceForm,
  type WhatsAppComplianceInitial,
} from "./compliance-form";
import { ProductionSetupGuide } from "./setup-production";
import { formatDateTime } from "@/lib/utils";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function WhatsAppIntegrationPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("whatsapp_settings").select("*").eq("id", 1).maybeSingle();

  type Settings = {
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
    twilio_whatsapp_number: string | null;
    is_sandbox: boolean | null;
    webhook_url: string | null;
    enabled: boolean | null;
    last_send_at: string | null;
    last_inbound_at: string | null;
    daily_send_limit: number | null;
    hourly_send_limit: number | null;
    min_seconds_between_sends: number | null;
    require_opt_in: boolean | null;
    enforce_24h_window: boolean | null;
    out_of_window_template_slug: string | null;
  };
  const settings = (data ?? null) as Settings | null;

  // Suggested webhook URL from request headers
  let suggestedWebhook = settings?.webhook_url ?? "";
  if (!suggestedWebhook) {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
      const proto = h.get("x-forwarded-proto") ?? "https";
      const envBase = process.env.TWILIO_WEBHOOK_BASE_URL;
      const base = envBase || (host ? `${proto}://${host}` : "");
      if (base) suggestedWebhook = `${base.replace(/\/$/, "")}/api/whatsapp/inbound`;
    } catch {
      /* ignore */
    }
  }

  // Stats : count of WhatsApp messages
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const oneDayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const oneHourAgoIso = new Date(Date.now() - 3600 * 1000).toISOString();

  const [
    { count: waCount },
    { count: optInCount },
    { count: optOutCount },
    { count: hour24Count },
    { count: hourSentCount },
    { count: dayySentCount },
    { count: tplApprovedCount },
    { count: tplActiveCount },
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("email_provider_id", "whatsapp.twilio"),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_opt_in", true),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_blocked", true),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .gte("whatsapp_last_inbound_at", oneDayAgoIso),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("email_provider_id", "whatsapp.twilio")
      .gte("created_at", oneHourAgoIso),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("email_provider_id", "whatsapp.twilio")
      .gte("created_at", oneDayAgoIso),
    supabase
      .from("whatsapp_templates")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("whatsapp_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  const { count: optInLast7d } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .gte("whatsapp_opt_in_at", sevenDaysAgoIso);

  const initial: WhatsAppSettingsInitial = {
    twilio_account_sid: settings?.twilio_account_sid ?? null,
    twilio_auth_token_set: !!settings?.twilio_auth_token,
    twilio_whatsapp_number: settings?.twilio_whatsapp_number ?? null,
    is_sandbox: !!settings?.is_sandbox,
    enabled: !!settings?.enabled,
    webhook_url: settings?.webhook_url ?? null,
  };

  const complianceInitial: WhatsAppComplianceInitial = {
    daily_send_limit: settings?.daily_send_limit ?? 250,
    hourly_send_limit: settings?.hourly_send_limit ?? 60,
    min_seconds_between_sends: settings?.min_seconds_between_sends ?? 5,
    require_opt_in: settings?.require_opt_in ?? true,
    enforce_24h_window: settings?.enforce_24h_window ?? true,
    out_of_window_template_slug: settings?.out_of_window_template_slug ?? null,
  };

  // Approved template slugs for the datalist
  const { data: approvedTpls } = await supabase
    .from("whatsapp_templates")
    .select("slug")
    .eq("status", "approved")
    .eq("is_active", true)
    .order("slug");
  const approvedSlugs = ((approvedTpls ?? []) as { slug: string }[]).map((t) => t.slug);

  const canTest =
    initial.enabled &&
    !!initial.twilio_account_sid &&
    initial.twilio_auth_token_set &&
    !!initial.twilio_whatsapp_number;

  const dailyLimit = complianceInitial.daily_send_limit;
  const hourLimit = complianceInitial.hourly_send_limit;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp via Twilio</h1>
          <p className="text-sm text-ink-2">
            Envoie des messages WhatsApp aux candidats et reçois leurs réponses dans la messagerie unifiée.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/integrations/whatsapp/templates">Gérer les templates HSM</Link>
        </Button>
      </div>

      {initial.is_sandbox ? (
        <Card className="bg-warn-light border-warn">
          <div className="p-4 text-sm">
            <p className="font-bold">Mode sandbox actif</p>
            <p className="text-ink-2 mt-1">
              Production interdite : il faut commander un numéro Twilio Business + lier ton WABA Meta
              + faire valider tes templates par Meta avant tout envoi en masse. Voir le guide en bas
              de page.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold mb-3">Conformité Meta — quotas et garde-fous</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Quotidien" value={`${dayySentCount ?? 0} / ${dailyLimit}`} />
            <Stat label="Heure" value={`${hourSentCount ?? 0} / ${hourLimit}`} />
            <Stat
              label="Délai mini"
              value={`${complianceInitial.min_seconds_between_sends}s`}
            />
            <Stat
              label="Templates approuvés"
              value={`${tplApprovedCount ?? 0} / ${tplActiveCount ?? 0} actifs`}
            />
            <Stat label="Opt-in actifs" value={`${optInCount ?? 0}`} />
            <Stat label="Bloqués / opt-out" value={`${optOutCount ?? 0}`} />
            <Stat
              label="Fenêtre 24 h ouvertes"
              value={`${hour24Count ?? 0}`}
            />
            <Stat label="Opt-in (7 j)" value={`${optInLast7d ?? 0}`} />
          </div>
        </div>
        <WhatsAppComplianceForm
          initial={complianceInitial}
          approvedTemplateSlugs={approvedSlugs}
        />
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold mb-3">Statut connexion Twilio</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Activé" value={initial.enabled ? "Oui" : "Non"} />
            <Stat label="Mode" value={initial.is_sandbox ? "Sandbox" : "Production"} />
            <Stat
              label="Dernier envoi"
              value={settings?.last_send_at ? formatDateTime(settings.last_send_at) : "Jamais"}
            />
            <Stat
              label="Dernière réception"
              value={settings?.last_inbound_at ? formatDateTime(settings.last_inbound_at) : "Jamais"}
            />
            <Stat label="Messages WhatsApp totaux" value={`${waCount ?? 0}`} />
            <Stat label="Numéro émetteur" value={initial.twilio_whatsapp_number ?? "—"} />
          </div>
          <div className="mt-4">
            <WhatsAppTestButton disabled={!canTest} />
            {!canTest ? (
              <p className="text-[11px] text-ink-3 mt-2">
                Renseigne SID, token, numéro émetteur et active l&apos;intégration pour pouvoir tester.
              </p>
            ) : null}
          </div>
        </div>
        <WhatsAppSettingsForm initial={initial} />
      </Card>

      <Card>
        <div className="p-4 space-y-3">
          <h2 className="font-bold">Webhook inbound (réception des réponses)</h2>
          <p className="text-sm text-ink-2">
            Configure cette URL dans la console Twilio : <strong>Messaging → Senders / WhatsApp Sandbox</strong>,
            champ <em>&quot;When a message comes in&quot;</em> (méthode <code>POST</code>).
          </p>
          <pre className="bg-surface-2 rounded-md p-2 text-xs font-mono overflow-x-auto">
            {suggestedWebhook || "(impossible de calculer — définis TWILIO_WEBHOOK_BASE_URL)"}
          </pre>
          <p className="text-[11px] text-ink-3">
            Twilio signe chaque requête avec le header <code>X-Twilio-Signature</code> validé par <code>twilio.validateRequest()</code>.
            Le webhook met à jour <code>whatsapp_opt_in</code>, <code>whatsapp_last_inbound_at</code>, et bloque
            automatiquement le candidat sur réception de <code>STOP</code> / <code>ARRÊT</code>.
          </p>
        </div>
      </Card>

      <ProductionSetupGuide webhookUrl={suggestedWebhook} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
