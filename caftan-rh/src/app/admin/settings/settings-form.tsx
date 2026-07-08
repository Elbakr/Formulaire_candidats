"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "./actions";
import { toast } from "sonner";

type Settings = {
  org_name: string;
  email_signature: string | null;
  timezone: string;
  default_language: string;
  logo_url: string | null;
  prayer_pause_enabled?: boolean | null;
  prayer_pause_summer?: string | null;
  prayer_pause_winter?: string | null;
  prayer_pause_dst_start?: string | null;
  prayer_pause_dst_end?: string | null;
  auto_outbound_to_people_enabled?: boolean | null;
  auto_scoring_communication?: boolean | null;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Paramètres enregistrés.");
        })
      }
      className="p-5 space-y-3 max-w-xl"
    >
      <div>
        <Label htmlFor="org_name">Nom de l'organisation</Label>
        <Input id="org_name" name="org_name" defaultValue={initial.org_name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="timezone">Fuseau horaire</Label>
          <Input id="timezone" name="timezone" defaultValue={initial.timezone} />
        </div>
        <div>
          <Label htmlFor="default_language">Langue par défaut</Label>
          <Input id="default_language" name="default_language" defaultValue={initial.default_language} />
        </div>
      </div>
      <div>
        <Label htmlFor="logo_url">URL du logo</Label>
        <Input id="logo_url" name="logo_url" type="url" defaultValue={initial.logo_url ?? ""} placeholder="https://..." />
      </div>
      <div>
        <Label htmlFor="email_signature">Signature email</Label>
        <Textarea
          id="email_signature"
          name="email_signature"
          rows={4}
          defaultValue={initial.email_signature ?? ""}
          placeholder="-- L'équipe CaftanRH ..."
        />
      </div>

      <fieldset className="border border-line rounded-md p-4 space-y-3">
        <legend className="text-sm font-bold px-2">Pause prière vendredi (auto-planning)</legend>
        <p className="text-xs text-ink-3">
          L&apos;auto-planning découpe les shifts qui chevauchent ce créneau le vendredi. Été/hiver détectés via les
          dates DST ci-dessous (format <code>MM-JJ</code>).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="prayer_pause_enabled"
            defaultChecked={initial.prayer_pause_enabled ?? true}
            className="h-4 w-4 rounded border-line"
          />
          <span>Activer la pause prière le vendredi</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="prayer_pause_summer">Pause été (HH:MM-HH:MM)</Label>
            <Input
              id="prayer_pause_summer"
              name="prayer_pause_summer"
              defaultValue={initial.prayer_pause_summer ?? "13:55-14:45"}
              placeholder="13:55-14:45"
            />
          </div>
          <div>
            <Label htmlFor="prayer_pause_winter">Pause hiver (HH:MM-HH:MM)</Label>
            <Input
              id="prayer_pause_winter"
              name="prayer_pause_winter"
              defaultValue={initial.prayer_pause_winter ?? "12:55-13:45"}
              placeholder="12:55-13:45"
            />
          </div>
          <div>
            <Label htmlFor="prayer_pause_dst_start">Début été (MM-JJ)</Label>
            <Input
              id="prayer_pause_dst_start"
              name="prayer_pause_dst_start"
              defaultValue={initial.prayer_pause_dst_start ?? "04-01"}
              placeholder="04-01"
            />
          </div>
          <div>
            <Label htmlFor="prayer_pause_dst_end">Fin été (MM-JJ)</Label>
            <Input
              id="prayer_pause_dst_end"
              name="prayer_pause_dst_end"
              defaultValue={initial.prayer_pause_dst_end ?? "10-01"}
              placeholder="10-01"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="border border-line rounded-md p-4 space-y-2">
        <legend className="text-sm font-bold px-2">Envois automatiques aux candidats / travailleurs</legend>
        <p className="text-xs text-ink-3">
          Contrôle l&apos;<strong>outreach automatique</strong> (rappels d&apos;entretien, convocations, refus, offres,
          relances signature, notices de fin). Ne concerne PAS les envois manuels, l&apos;authentification (liens de
          connexion) ni les confirmations. Quand c&apos;est désactivé, le système te notifie à la place.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="auto_outbound_to_people_enabled"
            defaultChecked={initial.auto_outbound_to_people_enabled ?? false}
            className="h-4 w-4 rounded border-line"
          />
          <span>Autoriser les emails automatiques vers les candidats/travailleurs</span>
        </label>
        <p className="text-[11px] text-ink-3">Décoché (recommandé) = aucun email automatique n&apos;est envoyé aux personnes.</p>
      </fieldset>

      <fieldset className="border border-line rounded-md p-4 space-y-2">
        <legend className="text-sm font-bold px-2">Communication automatique du scoring</legend>
        <p className="text-xs text-ink-3">
          Pilotera PLUS TARD (Phase 2) la communication <strong>automatique</strong> du scoring/journal de conformité au
          travailleur. <strong>Pour l&apos;instant ce réglage n&apos;active RIEN</strong> : le journal de manquements reste
          strictement INTERNE (fiche RH + escalade), jamais envoyé au travailleur.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="auto_scoring_communication"
            defaultChecked={initial.auto_scoring_communication ?? false}
            className="h-4 w-4 rounded border-line"
          />
          <span>Autoriser la communication automatique du scoring (Phase 2 — inactif)</span>
        </label>
      </fieldset>

      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "…" : "Enregistrer"}
      </Button>
    </form>
  );
}
