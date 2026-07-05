"use client";

// Karim 2026-06-02 : controles RH pour combler les trous de pointage.
//   - Bouton "+ Shift manuel" : dialog avec date, in/out, site, raison
//   - Bouton "💤 Jour de repos" : marque le jour comme repos explicite
//   - Bouton "📋 Historique" : popup avec toutes les corrections de cet employee

import { useState, useTransition, useEffect } from "react";
import { Plus, Moon, History, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  addManualShiftAction,
  markRestDayAction,
  getCorrectionsHistoryAction,
} from "./actions";

interface Site { id: string; code: string; name: string }

export function AddShiftControls({ employeeId, sites, defaultDate }: {
  employeeId: string;
  sites: Site[];
  defaultDate?: string;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openRest, setOpenRest] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => setOpenAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Shift manuel
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpenRest(true)}>
          <Moon className="h-3.5 w-3.5" /> Jour de repos
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpenHistory(true)}>
          <History className="h-3.5 w-3.5" /> Historique
        </Button>
      </div>

      {openAdd && (
        <AddShiftDialog
          employeeId={employeeId}
          sites={sites}
          defaultDate={defaultDate}
          onClose={() => setOpenAdd(false)}
        />
      )}
      {openRest && (
        <RestDayDialog
          employeeId={employeeId}
          defaultDate={defaultDate}
          onClose={() => setOpenRest(false)}
        />
      )}
      {openHistory && (
        <HistoryDialog
          employeeId={employeeId}
          onClose={() => setOpenHistory(false)}
        />
      )}
    </>
  );
}

function AddShiftDialog({ employeeId, sites, defaultDate, onClose }: {
  employeeId: string;
  sites: Site[];
  defaultDate?: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [inTime, setInTime] = useState("09:00");
  const [outTime, setOutTime] = useState("17:00");
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [reason, setReason] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await addManualShiftAction({
        employeeId, date, inTime, outTime, siteId: siteId || null, reason: reason || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Shift ajouté manuellement (audit log enregistré)");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un shift manuel</DialogTitle>
          <DialogDescription>
            Pour combler un trou de pointage (Tuya sync raté, oubli, etc.).
            La correction est tracée dans l&apos;historique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Heure entrée</Label>
              <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} step="60" />
            </div>
            <div>
              <Label>Heure sortie</Label>
              <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} step="60" />
            </div>
          </div>
          {sites.length > 0 && (
            <div>
              <Label>Site</Label>
              <select
                className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label>Justification (recommandée)</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Tuya sync raté, confirmé avec l'employee"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="gold" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ajouter le shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestDayDialog({ employeeId, defaultDate, onClose }: {
  employeeId: string;
  defaultDate?: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await markRestDayAction({ employeeId, date, reason: reason || undefined });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Jour de repos enregistré");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marquer un jour de repos</DialogTitle>
          <DialogDescription>
            Évite que ce jour soit traité comme un trou de pointage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Note (optionnelle)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Congé exceptionnel, jour férié, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="gold" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Marquer repos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [pending, setPending] = useState(true);
  const [corrections, setCorrections] = useState<Array<{ id: string; occurred_at: string; action: string; actor_name: string | null; reason: string | null; target_date: string | null; before_value: unknown; after_value: unknown }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getCorrectionsHistoryAction({ employeeId });
      if (alive) {
        setCorrections(res.corrections);
        setPending(false);
      }
    })();
    return () => { alive = false; };
  }, [employeeId]);

  const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
    create_manual: { label: "Ajout manuel", cls: "bg-blue-100 text-blue-800" },
    mark_rest_day: { label: "Jour de repos", cls: "bg-purple-100 text-purple-800" },
    edit_occurred_at: { label: "Édition heure", cls: "bg-amber-100 text-amber-800" },
    edit_kind: { label: "Édition kind", cls: "bg-amber-100 text-amber-800" },
    edit_site: { label: "Édition site", cls: "bg-amber-100 text-amber-800" },
    delete: { label: "Suppression", cls: "bg-red-100 text-red-800" },
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique des corrections</DialogTitle>
          <DialogDescription>
            Toutes les modifications manuelles effectuées sur les pointages de cet employé.
          </DialogDescription>
        </DialogHeader>

        {pending && <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}

        {!pending && corrections.length === 0 && (
          <div className="py-8 text-center text-sm text-ink-3">
            Aucune correction enregistrée pour cet employé.
          </div>
        )}

        {!pending && corrections.length > 0 && (
          <div className="space-y-2">
            {corrections.map((c) => {
              const meta = ACTION_LABEL[c.action] ?? { label: c.action, cls: "bg-gray-100 text-gray-800" };
              return (
                <div key={c.id} className="border border-line rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                    <span className="text-[10px] text-ink-3">{new Date(c.occurred_at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-ink-3">Par :</span>
                    <span className="font-medium">{c.actor_name ?? "—"}</span>
                    {c.target_date && (
                      <>
                        <span className="text-ink-3">·</span>
                        <span className="font-mono">{c.target_date}</span>
                      </>
                    )}
                  </div>
                  {c.reason && (
                    <div className="text-[11px] italic bg-muted/40 p-1.5 rounded">
                      {c.reason}
                    </div>
                  )}
                  {(c.before_value || c.after_value) && (
                    <details className="text-[10px] text-ink-3">
                      <summary className="cursor-pointer">Détails JSON</summary>
                      {c.before_value && (
                        <pre className="bg-red-50 p-1 mt-1 rounded overflow-x-auto">avant: {JSON.stringify(c.before_value)}</pre>
                      )}
                      {c.after_value && (
                        <pre className="bg-green-50 p-1 mt-1 rounded overflow-x-auto">après: {JSON.stringify(c.after_value)}</pre>
                      )}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-3.5 w-3.5" /> Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
