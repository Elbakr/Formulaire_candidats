"use client";

// Admin UI pour /admin/seasonal — saisonnalités événementielles boutique caftans.
//
// 3 zones :
//   1. Bandeau "événement actif aujourd'hui"
//   2. Timeline 12 mois (année courante) avec barres colorées par event
//   3. Liste des événements existants (statut : actif / passé / à venir) +
//      formulaire d'ajout, et bouton "Seed 2026-2027" (idempotent).

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Lock,
  Power,
  PowerOff,
  Database,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSeasonalEventAction,
  deleteSeasonalEventAction,
  toggleSeasonalEventActiveAction,
  seedDefaultSeasonalEventsAction,
  type SeasonalKind,
} from "./actions";

type SeasonalEvent = {
  id: string;
  name: string;
  kind: SeasonalKind;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  staff_multiplier: number | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

const MONTHS_FR = [
  "Janv", "Févr", "Mars", "Avril", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

const KIND_LABEL: Record<SeasonalKind, string> = {
  peak: "Pic",
  low: "Creux",
  closed: "Fermé",
};

const KIND_TONE: Record<SeasonalKind, string> = {
  peak: "bg-rose-500",
  low: "bg-sky-400",
  closed: "bg-ink-3",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isInWindow(eISOStart: string, eISOEnd: string, dayISO: string) {
  return eISOStart <= dayISO && dayISO <= eISOEnd;
}

export function SeasonalAdmin({ events }: { events: SeasonalEvent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const today = todayISO();
  const activeEvents = useMemo(
    () => events.filter((e) => e.is_active !== false && isInWindow(e.start_date, e.end_date, today)),
    [events, today],
  );

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearEvents = useMemo(
    () => events.filter((e) => e.end_date >= yearStart && e.start_date <= yearEnd),
    [events, yearStart, yearEnd],
  );

  function refresh() {
    router.refresh();
  }

  function onAdd(fd: FormData) {
    startTransition(async () => {
      const r = await addSeasonalEventAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Événement ajouté.");
        formRef.current?.reset();
        setOpen(false);
        refresh();
      }
    });
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    startTransition(async () => {
      const r = await deleteSeasonalEventAction(id);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Supprimé.");
        refresh();
      }
    });
  }

  function onToggle(id: string, currentlyActive: boolean) {
    startTransition(async () => {
      const r = await toggleSeasonalEventActiveAction(id, !currentlyActive);
      if ("error" in r && r.error) toast.error(r.error);
      else refresh();
    });
  }

  function onSeed() {
    if (
      !confirm(
        "Importer les événements 2026-2027 (Soldes, Ramadan, Aïd, Noël…) ? Les entrées déjà présentes ne seront pas dupliquées.",
      )
    )
      return;
    startTransition(async () => {
      const r = await seedDefaultSeasonalEventsAction();
      if ("error" in r && r.error) toast.error(r.error);
      else if ("inserted" in r) {
        toast.success(`${r.inserted} ajoutés, ${r.skipped} déjà présents.`);
        refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Saisonnalités événementielles</h1>
          <p className="text-sm text-ink-2">
            Pics et creux d'activité (Soldes, Ramadan, Aïd, Noël). Le solver
            multiplie les besoins d'effectif × <code>staff_multiplier</code> pendant
            ces fenêtres.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onSeed} disabled={pending}>
            <Database className="h-3.5 w-3.5" /> Seed 2026-2027
          </Button>
          <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nouvel événement
          </Button>
        </div>
      </div>

      {/* Bandeau "événement actif" */}
      {activeEvents.length > 0 ? (
        <Card>
          <div className="p-4 border-l-4 border-l-rose-500">
            <div className="flex items-start gap-3 flex-wrap">
              <Sparkles className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider font-bold text-ink-3 mb-1">
                  Saisonnalité en cours
                </div>
                {activeEvents.map((e) => (
                  <div key={e.id} className="text-sm">
                    <span className="font-bold">{e.name}</span>{" "}
                    <span className="text-ink-3">
                      ({KIND_LABEL[e.kind]} ×{(e.staff_multiplier ?? 1).toFixed(2)})
                    </span>
                    {e.notes ? (
                      <div className="text-xs text-ink-2 mt-0.5">{e.notes}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Timeline 12 mois */}
      <Card>
        <div className="p-3 sm:p-4 border-b border-line flex items-center gap-3 flex-wrap">
          <h2 className="font-bold">Calendrier {year}</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setYear(year - 1)} title="Année précédente">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setYear(new Date().getFullYear())}>
              Cette année
            </Button>
            <Button variant="outline" size="sm" onClick={() => setYear(year + 1)} title="Année suivante">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="p-3 sm:p-4 overflow-x-auto">
          {/* Mini-timeline 12 colonnes — chaque événement est une barre */}
          <div className="grid grid-cols-12 gap-1 text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-2">
            {MONTHS_FR.map((m) => (
              <div key={m} className="text-center">{m}</div>
            ))}
          </div>
          {yearEvents.length === 0 ? (
            <div className="p-6 text-sm text-ink-3 text-center">
              Aucun événement pour {year}. Clique « Seed 2026-2027 » ou « Nouvel événement ».
            </div>
          ) : (
            <div className="space-y-1.5">
              {yearEvents.map((e) => {
                // Position en pourcentage du year (0..1)
                const start = new Date(e.start_date + "T00:00:00");
                const end = new Date(e.end_date + "T00:00:00");
                const yearStartDate = new Date(`${year}-01-01T00:00:00`);
                const yearEndDate = new Date(`${year}-12-31T00:00:00`);
                const startClamp = start < yearStartDate ? yearStartDate : start;
                const endClamp = end > yearEndDate ? yearEndDate : end;
                const total = yearEndDate.getTime() - yearStartDate.getTime();
                const offsetPct = ((startClamp.getTime() - yearStartDate.getTime()) / total) * 100;
                const widthPct = Math.max(
                  0.5,
                  ((endClamp.getTime() - startClamp.getTime()) / total) * 100,
                );
                const tone = KIND_TONE[e.kind];
                const inactive = e.is_active === false;
                return (
                  <div key={e.id} className="relative h-6 bg-surface-2 rounded-sm">
                    <div
                      className={`absolute h-full rounded-sm ${tone} ${inactive ? "opacity-30" : "opacity-90"}`}
                      style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                      title={`${e.name} (${e.start_date} → ${e.end_date})`}
                    />
                    <div className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-ink whitespace-nowrap pointer-events-none">
                      <span className={inactive ? "text-ink-3 line-through" : ""}>
                        {e.name}
                      </span>
                      <span className="text-ink-3 ml-2">
                        ×{(e.staff_multiplier ?? 1).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Liste détaillée */}
      <Card>
        <div className="p-3 sm:p-4 border-b border-line">
          <h2 className="font-bold">Tous les événements ({events.length})</h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-sm text-ink-3 text-center">
            Aucun événement. Clique « Seed 2026-2027 » pour démarrer rapidement.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => {
              const status =
                e.end_date < today ? "passé" : e.start_date > today ? "à venir" : "actif";
              const statusTone =
                status === "actif"
                  ? "bg-success-light text-success"
                  : status === "à venir"
                    ? "bg-info-light text-info"
                    : "bg-surface-2 text-ink-3";
              const KindIcon =
                e.kind === "peak" ? TrendingUp : e.kind === "low" ? TrendingDown : Lock;
              return (
                <li key={e.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div
                      className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                        e.kind === "peak" ? "bg-rose-100 text-rose-600" :
                        e.kind === "low" ? "bg-sky-100 text-sky-600" :
                        "bg-surface-2 text-ink-3"
                      }`}
                    >
                      <KindIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{e.name}</div>
                      <div className="text-xs text-ink-3">
                        {e.start_date} → {e.end_date} · {KIND_LABEL[e.kind]} ×
                        {(e.staff_multiplier ?? 1).toFixed(2)}
                      </div>
                      {e.notes ? (
                        <div className="text-xs text-ink-2 mt-0.5">{e.notes}</div>
                      ) : null}
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusTone}`}
                    >
                      {status}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggle(e.id, e.is_active !== false)}
                      title={e.is_active !== false ? "Désactiver" : "Activer"}
                      disabled={pending}
                    >
                      {e.is_active !== false ? (
                        <Power className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <PowerOff className="h-3.5 w-3.5 text-ink-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(e.id, e.name)}
                      title="Supprimer"
                      disabled={pending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Dialog d'ajout */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel événement saisonnier</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={onAdd} className="space-y-3">
            <div>
              <Label htmlFor="se-name">Nom</Label>
              <Input id="se-name" name="name" required placeholder="Soldes janvier 2027" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="se-kind">Type</Label>
                <Select name="kind" defaultValue="peak">
                  <SelectTrigger id="se-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="peak">Pic d'activité</SelectItem>
                    <SelectItem value="low">Creux</SelectItem>
                    <SelectItem value="closed">Fermeture</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="se-mult">Multiplier (1.0 = neutre)</Label>
                <Input
                  id="se-mult"
                  name="staff_multiplier"
                  type="number"
                  min="0.1"
                  max="3.0"
                  step="0.05"
                  defaultValue="1.3"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="se-start">Date début</Label>
                <Input id="se-start" name="start_date" type="date" required />
              </div>
              <div>
                <Label htmlFor="se-end">Date fin</Label>
                <Input id="se-end" name="end_date" type="date" required />
              </div>
            </div>
            <div>
              <Label htmlFor="se-notes">Notes (optionnel)</Label>
              <Textarea
                id="se-notes"
                name="notes"
                rows={2}
                placeholder="Ex. : essayages massifs, renforcer 17h-21h"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" disabled={pending}>
                Ajouter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
