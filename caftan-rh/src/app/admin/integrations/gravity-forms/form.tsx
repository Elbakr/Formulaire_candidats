"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveGfSettingsAction } from "./actions";
import { toast } from "sonner";

type Settings = {
  wp_url: string;
  ck: string | null;
  cs: string | null;
  form_id: number;
  field_map: Record<string, string>;
  enabled: boolean;
};

const FIELD_KEYS: Array<[keyof Pick<Settings, never> | string, string]> = [
  ["firstname", "Prénom"],
  ["lastname", "Nom"],
  ["birthdate", "Date de naissance"],
  ["email", "Email"],
  ["phone", "Téléphone"],
  ["cv_url", "CV (URL fichier)"],
  ["available_from", "Disponible à partir de"],
  ["worktime", "Disponibilités texte"],
  ["role", "Poste demandé"],
  ["city", "Ville"],
  ["days_prefix", "Jours de la semaine (préfixe — ex. 11 → 11.1..11.7)"],
];

export function GfSettingsForm({ initial }: { initial: Settings }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveGfSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Configuration enregistrée.");
        })
      }
      className="p-5 space-y-4"
    >
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="wp_url">URL WordPress</Label>
          <Input id="wp_url" name="wp_url" type="url" defaultValue={initial.wp_url} required />
        </div>
        <div>
          <Label htmlFor="form_id">ID du formulaire</Label>
          <Input id="form_id" name="form_id" type="number" min={1} defaultValue={initial.form_id} required />
        </div>
        <div>
          <Label htmlFor="ck">Consumer Key (ck_…)</Label>
          <Input id="ck" name="ck" defaultValue={initial.ck ?? ""} placeholder="ck_xxxxxxxx" required />
        </div>
        <div>
          <Label htmlFor="cs">Consumer Secret (cs_…)</Label>
          <Input id="cs" name="cs" type="password" defaultValue={initial.cs ?? ""} placeholder="cs_xxxxxxxx" required />
        </div>
      </div>

      <div>
        <Label className="mb-2">Mapping des champs Gravity Forms</Label>
        <p className="text-xs text-ink-3 mb-2">
          Indique l'ID numérique du champ GF pour chacun. Utilise les <strong>IDs</strong> tels qu'affichés dans
          Gravity Forms (ex. champ "Email" = <code>5</code>).
        </p>
        <div className="grid md:grid-cols-2 gap-2">
          {FIELD_KEYS.map(([k, label]) => (
            <div key={k as string}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-2 mb-0.5 block">{label}</label>
              <Input
                name={`field_${k}`}
                defaultValue={initial.field_map[k as string] ?? ""}
                placeholder="ex. 1"
                className="font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          name="enabled"
          defaultChecked={initial.enabled}
          className="rounded border-line h-4 w-4"
        />
        <label htmlFor="enabled" className="text-sm font-semibold">
          Activer la sync automatique (toutes les 15 min via cron)
        </label>
      </div>

      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
