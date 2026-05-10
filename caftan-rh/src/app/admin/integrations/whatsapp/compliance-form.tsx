"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWhatsAppComplianceAction } from "./actions";
import { toast } from "sonner";

export type WhatsAppComplianceInitial = {
  daily_send_limit: number;
  hourly_send_limit: number;
  min_seconds_between_sends: number;
  require_opt_in: boolean;
  enforce_24h_window: boolean;
  out_of_window_template_slug: string | null;
};

export function WhatsAppComplianceForm({
  initial,
  approvedTemplateSlugs,
}: {
  initial: WhatsAppComplianceInitial;
  approvedTemplateSlugs: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveWhatsAppComplianceAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Règles de conformité enregistrées.");
        })
      }
      className="p-5 space-y-4"
    >
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="daily_send_limit">Limite quotidienne</Label>
          <Input
            id="daily_send_limit"
            name="daily_send_limit"
            type="number"
            min={1}
            max={10000}
            defaultValue={initial.daily_send_limit}
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Tier 1 Meta : 250 conversations/24h. À ajuster selon ton tier.
          </p>
        </div>
        <div>
          <Label htmlFor="hourly_send_limit">Limite horaire</Label>
          <Input
            id="hourly_send_limit"
            name="hourly_send_limit"
            type="number"
            min={1}
            max={1000}
            defaultValue={initial.hourly_send_limit}
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Anti-burst. Recommandé : 60.
          </p>
        </div>
        <div>
          <Label htmlFor="min_seconds_between_sends">Intervalle min (sec)</Label>
          <Input
            id="min_seconds_between_sends"
            name="min_seconds_between_sends"
            type="number"
            min={0}
            max={600}
            defaultValue={initial.min_seconds_between_sends}
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Délai mini entre 2 envois <em>au même</em> candidat.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            name="require_opt_in"
            defaultChecked={initial.require_opt_in}
            className="rounded border-line h-4 w-4"
          />
          Exiger un opt-in (recommandé)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            name="enforce_24h_window"
            defaultChecked={initial.enforce_24h_window}
            className="rounded border-line h-4 w-4"
          />
          Bloquer les envois freeform hors fenêtre 24 h
        </label>
      </div>

      <div>
        <Label htmlFor="out_of_window_template_slug">
          Template par défaut hors fenêtre 24 h (slug)
        </Label>
        <Input
          id="out_of_window_template_slug"
          name="out_of_window_template_slug"
          defaultValue={initial.out_of_window_template_slug ?? ""}
          list="wa-tpl-slugs"
          placeholder="interview_invite_v1"
          className="font-mono"
        />
        <datalist id="wa-tpl-slugs">
          {approvedTemplateSlugs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="text-[11px] text-ink-3 mt-1">
          Optionnel — proposé en première option dans l&apos;UI quand on ouvre une nouvelle conversation.
        </p>
      </div>

      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer la conformité"}
      </Button>
    </form>
  );
}
