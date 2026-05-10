"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWhatsAppSettingsAction } from "./actions";
import { toast } from "sonner";

export type WhatsAppSettingsInitial = {
  twilio_account_sid: string | null;
  twilio_auth_token_set: boolean;
  twilio_whatsapp_number: string | null;
  is_sandbox: boolean;
  enabled: boolean;
  webhook_url: string | null;
};

export function WhatsAppSettingsForm({ initial }: { initial: WhatsAppSettingsInitial }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveWhatsAppSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Configuration WhatsApp enregistrée.");
        })
      }
      className="p-5 space-y-4"
    >
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="twilio_account_sid">Twilio Account SID</Label>
          <Input
            id="twilio_account_sid"
            name="twilio_account_sid"
            defaultValue={initial.twilio_account_sid ?? ""}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="twilio_auth_token">Twilio Auth Token</Label>
          <Input
            id="twilio_auth_token"
            name="twilio_auth_token"
            type="password"
            defaultValue={initial.twilio_auth_token_set ? "********" : ""}
            placeholder={initial.twilio_auth_token_set ? "(déjà configuré)" : "votre token"}
            className="font-mono"
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Laisse <code>********</code> pour conserver la valeur existante.
          </p>
        </div>
        <div>
          <Label htmlFor="twilio_whatsapp_number">Numéro WhatsApp Twilio</Label>
          <Input
            id="twilio_whatsapp_number"
            name="twilio_whatsapp_number"
            defaultValue={initial.twilio_whatsapp_number ?? ""}
            placeholder="+14155238886 (sandbox) ou +32xxxxxxxxx"
            className="font-mono"
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Format E.164. Ne pas inclure le préfixe <code>whatsapp:</code> (ajouté automatiquement).
          </p>
        </div>
        <div>
          <Label htmlFor="webhook_url">URL Webhook (optionnel)</Label>
          <Input
            id="webhook_url"
            name="webhook_url"
            type="url"
            defaultValue={initial.webhook_url ?? ""}
            placeholder="https://votre-app.vercel.app/api/whatsapp/inbound"
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Affiché dans la zone &quot;Setup&quot;. Configure cette URL dans la console Twilio.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            name="is_sandbox"
            defaultChecked={initial.is_sandbox}
            className="rounded border-line h-4 w-4"
          />
          Mode sandbox (numéro <code>+14155238886</code>)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled}
            className="rounded border-line h-4 w-4"
          />
          Activer l&apos;envoi et la réception WhatsApp
        </label>
      </div>

      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
