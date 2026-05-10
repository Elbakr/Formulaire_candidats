"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  updateGeofenceSettingsAction,
  updateSiteGeofenceAction,
} from "./actions";

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  light_color: string | null;
  geofence_radius_m: number | null;
};

export function GeofenceGlobalForm({
  defaultRadius,
  strict,
}: {
  defaultRadius: number;
  strict: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateGeofenceSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Paramètres géofence enregistrés.");
        })
      }
      className="p-5 space-y-4"
    >
      <div className="grid md:grid-cols-2 gap-4 items-end">
        <div>
          <Label htmlFor="default_radius_m">Rayon par défaut (m)</Label>
          <Input
            id="default_radius_m"
            name="default_radius_m"
            type="number"
            min={25}
            max={5000}
            defaultValue={defaultRadius}
          />
          <p className="text-[11px] text-ink-3 mt-0.5">
            Appliqué à tous les sites qui n'ont pas d'override explicite. Plage 25–5000m.
          </p>
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm border border-line rounded-md p-3 hover:bg-surface-2/50">
            <input
              type="checkbox"
              name="clock_geofence_strict"
              defaultChecked={strict}
              className="h-4 w-4 mt-0.5 rounded border-line"
            />
            <span>
              <span className="font-bold">Mode strict (bloquant)</span>
              <span className="block text-[11px] text-ink-3 mt-0.5">
                Le clock-in est refusé si l'employé est hors rayon ou n'a pas
                activé sa géoloc. Si décoché : pointage autorisé mais flagué
                en anomalie pour audit RH.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

export function GeofencePerSiteList({ sites }: { sites: Site[] }) {
  return (
    <ul className="divide-y divide-line">
      {sites.map((s) => (
        <SiteRadiusRow key={s.id} site={s} />
      ))}
    </ul>
  );
}

function SiteRadiusRow({ site }: { site: Site }) {
  const [value, setValue] = useState<number>(site.geofence_radius_m ?? 100);
  const [pending, startTransition] = useTransition();

  return (
    <li className="p-3 flex items-center gap-3">
      <span
        className="inline-flex w-7 h-7 rounded items-center justify-center text-white font-bold text-xs shrink-0"
        style={{ backgroundColor: site.color ?? "#666" }}
      >
        {site.code}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{site.name}</div>
        <div className="text-[11px] text-ink-3">Rayon individuel pour ce site</div>
      </div>
      <Input
        type="number"
        min={25}
        max={5000}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-24 text-right"
      />
      <span className="text-xs text-ink-3 -ml-2">m</span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || value === (site.geofence_radius_m ?? 100)}
        onClick={() =>
          startTransition(async () => {
            const r = await updateSiteGeofenceAction(site.id, value);
            if (r?.error) toast.error(r.error);
            else toast.success(`${site.code} : rayon enregistré (${value} m).`);
          })
        }
      >
        {pending ? "…" : "OK"}
      </Button>
    </li>
  );
}
