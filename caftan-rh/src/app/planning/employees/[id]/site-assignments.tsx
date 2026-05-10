"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  assignEmployeeToSiteAction,
  endAssignmentAction,
  deleteAssignmentAction,
} from "./site-actions";

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

type Assignment = {
  id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  pct: number | null;
  site: Site | null;
};

export function SiteAssignmentsSection({
  employeeId,
  assignments,
  sites,
}: {
  employeeId: string;
  assignments: Assignment[];
  sites: Site[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [siteId, setSiteId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [pct, setPct] = useState<number>(100);
  const [pending, startTransition] = useTransition();

  const todayISO = new Date().toISOString().slice(0, 10);
  const active = assignments.filter(
    (a) => a.start_date <= todayISO && (!a.end_date || a.end_date >= todayISO),
  );
  const past = assignments.filter(
    (a) => a.end_date && a.end_date < todayISO,
  );

  function submit() {
    if (!siteId) {
      toast.error("Choisis un site.");
      return;
    }
    startTransition(async () => {
      const r = await assignEmployeeToSiteAction({
        employeeId,
        siteId,
        startDate,
        endDate: endDate || null,
        isPrimary,
        pct,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Affectation créée. L'employé a été ajouté au groupe chat du site.");
      setAdding(false);
      setSiteId("");
      setIsPrimary(false);
      setPct(100);
      setEndDate("");
      router.refresh();
    });
  }

  function endNow(a: Assignment) {
    startTransition(async () => {
      const r = await endAssignmentAction({
        assignmentId: a.id,
        employeeId,
        endDate: todayISO,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affectation clôturée.");
        router.refresh();
      }
    });
  }

  function remove(a: Assignment) {
    if (!confirm("Supprimer définitivement cette affectation ?")) return;
    startTransition(async () => {
      const r = await deleteAssignmentAction({
        assignmentId: a.id,
        employeeId,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affectation supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gold-dark" />
            Affectations site
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Détermine sur quel(s) site(s) l'employé travaille. L'ajouter au site
            l'inscrit automatiquement au groupe chat correspondant.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(false)}
          >
            <X className="h-3.5 w-3.5" /> Annuler
          </Button>
        )}
      </div>

      {adding ? (
        <div className="p-4 border-b border-line bg-surface-2/30">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Site
              </span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              >
                <option value="">— choisir —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Début
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Fin (optionnel)
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Quotité %
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={pct}
                onChange={(e) => setPct(parseInt(e.target.value, 10) || 100)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
              />
              Site principal
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={submit} disabled={pending} size="sm">
              {pending ? "Enregistrement…" : "Créer l'affectation"}
            </Button>
          </div>
        </div>
      ) : null}

      {active.length === 0 && past.length === 0 ? (
        <div className="p-6 text-center text-sm text-ink-3 italic">
          Aucune affectation. Ajoute-en une pour intégrer l'employé au planning
          du site et au groupe chat.
        </div>
      ) : null}

      {active.length > 0 ? (
        <div className="p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
            Actuelles
          </div>
          {active.map((a) => (
            <Row key={a.id} a={a} onEnd={() => endNow(a)} onDelete={() => remove(a)} />
          ))}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="p-4 border-t border-line space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
            Historique
          </div>
          {past.map((a) => (
            <Row key={a.id} a={a} onDelete={() => remove(a)} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Row({
  a,
  onEnd,
  onDelete,
}: {
  a: Assignment;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("fr-BE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  return (
    <div className="flex items-center gap-3 p-2 border border-line rounded-md">
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white text-sm shrink-0"
        style={{ backgroundColor: a.site?.color ?? "#666" }}
      >
        {a.site?.code ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">
          {a.site?.name ?? "—"}
          {a.is_primary ? (
            <span className="ml-2 text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-gold-light text-gold-dark">
              Principal
            </span>
          ) : null}
        </div>
        <div className="text-xs text-ink-3">
          du {fmt(a.start_date)}
          {a.end_date ? ` au ${fmt(a.end_date)}` : " (en cours)"}
          {a.pct && a.pct < 100 ? ` · ${a.pct}%` : ""}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {onEnd ? (
          <Button variant="ghost" size="sm" onClick={onEnd}>
            Clôturer
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
