"use client";

// Karim 2026-07-12 : gestion des tablettes planning (A..G). Une ligne par tablette :
// lien /t/<jeton> unique + copie 1-clic + régénérer + activer/désactiver. + ajout.

import { useState, useTransition } from "react";
import { Tablet, Copy, RefreshCw, Check, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  regenerateTabletDeviceAction,
  setTabletDeviceActiveAction,
  addTabletDeviceAction,
} from "./tablet-devices-actions";

export type TabletDevice = { code: string; label: string | null; token: string; active: boolean };

export function TabletDevicesManager({
  initial,
  baseUrl,
}: {
  initial: TabletDevice[];
  baseUrl: string;
}) {
  const [devices, setDevices] = useState<TabletDevice[]>(initial);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");

  function urlOf(token: string) {
    return `${baseUrl}/t/${token}`;
  }

  async function copy(code: string, token: string) {
    try {
      await navigator.clipboard.writeText(urlOf(token));
      setCopied(code);
      toast.success(`Lien tablette ${code} copié.`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copie impossible — sélectionne le lien manuellement.");
    }
  }

  function regenerate(code: string) {
    if (pending) return;
    if (!confirm(`Régénérer le jeton de la tablette ${code} ? L'ancien lien cessera de fonctionner (il faudra reconfigurer cette tablette).`)) return;
    start(async () => {
      const r = await regenerateTabletDeviceAction(code);
      if (r.error || !r.token) return toast.error(r.error ?? "Échec.");
      setDevices((d) => d.map((x) => (x.code === code ? { ...x, token: r.token!, active: true } : x)));
      toast.success(`Nouveau lien pour la tablette ${code}. Reconfigure-la.`);
    });
  }

  function toggleActive(code: string, active: boolean) {
    start(async () => {
      const r = await setTabletDeviceActiveAction(code, active);
      if (r.error) return toast.error(r.error);
      setDevices((d) => d.map((x) => (x.code === code ? { ...x, active } : x)));
      toast.success(active ? `Tablette ${code} activée.` : `Tablette ${code} désactivée (lien 404).`);
    });
  }

  function add() {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    start(async () => {
      const r = await addTabletDeviceAction(code);
      if (r.error || !r.token) return toast.error(r.error ?? "Échec.");
      setDevices((d) => [...d, { code, label: null, token: r.token!, active: true }].sort((a, b) => a.code.localeCompare(b.code)));
      setNewCode("");
      toast.success(`Tablette ${code} ajoutée.`);
    });
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-gold-light flex items-center justify-center text-gold-dark shrink-0">
          <Tablet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm">Tablettes planning (une par magasin)</div>
          <p className="text-xs text-ink-3">
            Chaque tablette a un lien <strong>secret et unique</strong>{" "}
            <code className="font-mono bg-surface-2 px-1 rounded">/t/&lt;jeton&gt;</code>. Installe le lien
            en <strong>web-app</strong> sur l&apos;appareil (écran d&apos;accueil) : il rouvre directement le
            planning. Ne diffuse pas les liens. Le travailleur saisit ensuite son code personnel.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {devices.map((d) => (
          <div
            key={d.code}
            className={`rounded-md border p-2.5 ${d.active ? "border-line bg-surface" : "border-line bg-surface-2/60 opacity-70"}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-ink text-canvas text-xs font-bold">
                {d.code}
              </span>
              <span className="text-[12px] font-semibold">Tablette {d.code}</span>
              {d.label ? <span className="text-[11px] text-ink-3">· {d.label}</span> : null}
              {!d.active ? <span className="text-[10px] font-bold text-danger">DÉSACTIVÉE</span> : null}
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[11px] break-all">
                {urlOf(d.token)}
              </div>
              <button
                type="button"
                onClick={() => copy(d.code, d.token)}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-2"
              >
                {copied === d.code ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === d.code ? "Copié" : "Copier"}
              </button>
            </div>
            <div className="flex gap-2 mt-1.5">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => regenerate(d.code)}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${pending ? "animate-spin" : ""}`} />
                Régénérer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => toggleActive(d.code, !d.active)}
              >
                <Power className="h-3.5 w-3.5 mr-1" />
                {d.active ? "Désactiver" : "Activer"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="Nouveau code (ex. H)"
          className="max-w-[160px]"
        />
        <Button type="button" size="sm" variant="gold" disabled={pending || !newCode.trim()} onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter une tablette
        </Button>
      </div>
    </div>
  );
}
