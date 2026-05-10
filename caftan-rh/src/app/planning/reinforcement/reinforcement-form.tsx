"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createReinforcementRequestAction,
  listReinforcementCandidatesAction,
  proposeReinforcementAction,
  type ReinforcementCandidate,
} from "./actions";

type SiteOpt = { id: string; code: string; name: string; color: string | null };

export function ReinforcementForm({
  sites,
  presetDate,
}: {
  sites: SiteOpt[];
  presetDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [date, setDate] = useState(presetDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("14:00");
  const [position, setPosition] = useState("");
  const [notes, setNotes] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReinforcementCandidate[]>([]);
  const [propose, startProposeTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId) {
      toast.error("Choisis un site.");
      return;
    }
    setCandidates([]);
    setRequestId(null);
    startTransition(async () => {
      const r = await createReinforcementRequestAction({
        siteId,
        date,
        startTime,
        endTime,
        position: position || null,
        notes: notes || null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setRequestId(r.id ?? null);
      toast.success("Demande créée. Chargement des candidats…");
      const list = await listReinforcementCandidatesAction(r.id!);
      if (list.error) {
        toast.error(list.error);
        return;
      }
      setCandidates(list.candidates ?? []);
      router.refresh();
    });
  }

  function doPropose(employeeId: string) {
    if (!requestId) return;
    startProposeTransition(async () => {
      const r = await proposeReinforcementAction({ requestId, employeeId });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Proposition envoyée à l'employé.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label>Site</Label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full h-10 rounded-md border-[1.5px] border-line bg-surface px-3 text-sm"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            className="mt-1 h-10"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Début</Label>
            <Input
              type="time"
              className="mt-1 h-10"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Fin</Label>
            <Input
              type="time"
              className="mt-1 h-10"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <Label>Position / poste (optionnel)</Label>
          <Input
            className="mt-1 h-10"
            placeholder="Ex. Vente, Logistique"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <Label>Notes (optionnel)</Label>
          <Textarea
            className="mt-1"
            rows={2}
            placeholder="Contexte de la demande, urgence, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            type="submit"
            variant="gold"
            disabled={pending}
            className="min-h-[44px]"
          >
            <Plus className="h-4 w-4" /> {pending ? "Création…" : "Créer + voir candidats"}
          </Button>
        </div>
      </form>

      {candidates.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-2 text-xs font-bold uppercase tracking-wider">
            Candidats classés (proximité → heures restantes → tier)
          </div>
          <ul className="divide-y divide-line max-h-[420px] overflow-y-auto">
            {candidates.map((c) => (
              <li
                key={c.employee_id}
                className={`p-3 flex flex-wrap items-center gap-2 text-xs ${
                  c.has_conflict ? "bg-surface-2 opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="font-bold text-sm">{c.employee_name}</div>
                  <div className="text-ink-3">
                    {c.job_title ?? "—"}
                    {c.tier === 1 ? " · primary" : c.tier === 2 ? " · secondary" : " · external"}
                  </div>
                </div>
                <div className="font-mono text-ink-2 text-right shrink-0">
                  <div>
                    {c.distance_km == null ? "—" : `${c.distance_km.toFixed(1)} km`}
                  </div>
                  <div className="text-[10px] text-ink-3">
                    {c.remaining_hours.toFixed(1)}h dispo
                  </div>
                </div>
                {c.has_conflict ? (
                  <span className="px-2 py-1 rounded bg-warn-light text-warn text-[10px] font-bold">
                    {c.reason_blocked ?? "Bloqué"}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={propose}
                    onClick={() => doPropose(c.employee_id)}
                    className="min-h-[40px]"
                  >
                    Proposer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
