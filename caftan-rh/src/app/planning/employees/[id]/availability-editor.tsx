"use client";
// Karim 15/05/2026 : edition admin/RH des dispos employe (jours OFF fixes
// + indispos recurrentes + indispos ponctuelles). Le store est partage avec
// /me/availability cote employe -> 2-way sync naturelle via la meme table
// employee_unavailabilities.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CalendarClock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import {
  addEmployeeUnavailabilityAdminAction,
  deleteEmployeeUnavailabilityAdminAction,
  updateEmployeeFixedOffDaysAdminAction,
} from "./availability-actions";

const DOW_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_LABELS_OFF = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]; // index 0 = lun (convention DB)
const REASON_OPTIONS = [
  { value: "", label: "—" },
  { value: "cours", label: "Cours" },
  { value: "examen", label: "Examen" },
  { value: "medical", label: "Médical" },
  { value: "perso", label: "Personnel" },
  { value: "autre", label: "Autre" },
];
const REASON_LABELS: Record<string, string> = {
  cours: "Cours",
  examen: "Examen",
  medical: "Médical",
  perso: "Personnel",
  autre: "Autre",
};

export type UnavailItem = {
  id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
  is_active: boolean;
};

export function EmployeeAvailabilityEditor({
  employeeId,
  fixedOffDays,
  items,
}: {
  employeeId: string;
  fixedOffDays: number[];
  items: UnavailItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [offDays, setOffDays] = useState<number[]>(fixedOffDays);
  const [offDirty, setOffDirty] = useState(false);

  // States pour la creation d une recurring
  const [recDow, setRecDow] = useState<string>("");
  const [recStart, setRecStart] = useState<string>("");
  const [recEnd, setRecEnd] = useState<string>("");
  const [recReason, setRecReason] = useState<string>("");
  const [recNotes, setRecNotes] = useState<string>("");

  // States pour la creation d une specific
  const [specDate, setSpecDate] = useState<string>("");
  const [specStart, setSpecStart] = useState<string>("");
  const [specEnd, setSpecEnd] = useState<string>("");
  const [specReason, setSpecReason] = useState<string>("");
  const [specNotes, setSpecNotes] = useState<string>("");

  const recurring = items.filter((i) => i.day_of_week !== null);
  const specific = items.filter((i) => i.date_specific !== null);
  const offSet = new Set(offDays.filter((d) => d >= 0 && d <= 6));

  function toggleOffDay(dow: number) {
    const next = offSet.has(dow)
      ? offDays.filter((d) => d !== dow)
      : [...offDays, dow].sort();
    setOffDays(next);
    setOffDirty(true);
  }
  function saveOffDays() {
    startTransition(async () => {
      const r = await updateEmployeeFixedOffDaysAdminAction(employeeId, offDays);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Jours OFF mis à jour.");
        setOffDirty(false);
        router.refresh();
      }
    });
  }

  function addRecurring() {
    const dowNum = Number(recDow);
    if (!Number.isInteger(dowNum) || dowNum < 0 || dowNum > 6) {
      toast.error("Choisis un jour de la semaine.");
      return;
    }
    if (!recStart || !recEnd) {
      toast.error("Heures début/fin requises.");
      return;
    }
    startTransition(async () => {
      const r = await addEmployeeUnavailabilityAdminAction({
        employeeId,
        mode: "recurring",
        day_of_week: dowNum,
        start_time: recStart,
        end_time: recEnd,
        reason: recReason || null,
        notes: recNotes || null,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Indispo récurrente ajoutée.");
        setRecDow("");
        setRecStart("");
        setRecEnd("");
        setRecReason("");
        setRecNotes("");
        router.refresh();
      }
    });
  }

  function addSpecific() {
    if (!specDate) {
      toast.error("Date requise.");
      return;
    }
    startTransition(async () => {
      const r = await addEmployeeUnavailabilityAdminAction({
        employeeId,
        mode: "specific",
        date_specific: specDate,
        start_time: specStart || null,
        end_time: specEnd || null,
        reason: specReason || null,
        notes: specNotes || null,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Absence ponctuelle ajoutée.");
        setSpecDate("");
        setSpecStart("");
        setSpecEnd("");
        setSpecReason("");
        setSpecNotes("");
        router.refresh();
      }
    });
  }

  function deleteItem(id: string) {
    if (!confirm("Supprimer cette dispo ?")) return;
    startTransition(async () => {
      const r = await deleteEmployeeUnavailabilityAdminAction(id, employeeId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-ink-2" />
        <div>
          <h2 className="font-bold text-sm">Dispos employé — édition RH/admin</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Modifications synchronisées en temps réel avec /me/availability côté
            employé. Le solver consomme ces contraintes.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Jours OFF fixes */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5 flex items-center gap-2">
            Jours toujours OFF
            {offDirty ? (
              <Button
                size="sm"
                variant="gold"
                onClick={saveOffDays}
                disabled={pending}
                className="ml-auto h-6 px-2 text-[10px]"
              >
                <Save className="h-3 w-3" /> Sauver
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS_OFF.map((d, i) => {
              const on = offSet.has(i);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleOffDay(i)}
                  className={
                    on
                      ? "px-2.5 py-1 rounded-md text-xs font-bold bg-violet text-white"
                      : "px-2.5 py-1 rounded-md text-xs font-semibold border border-line bg-surface text-ink-3 hover:border-violet"
                  }
                >
                  {d}
                </button>
              );
            })}
          </div>
          {offSet.size === 0 ? (
            <p className="text-[11px] text-ink-3 mt-1">Aucun jour off déclaré.</p>
          ) : null}
        </div>

        {/* Recurring */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5">
            Indispos récurrentes
          </div>
          {recurring.length === 0 ? (
            <p className="text-xs text-ink-3">Aucun créneau récurrent déclaré.</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {recurring.map((u) => (
                <li
                  key={u.id}
                  className="text-xs text-ink-2 flex items-center gap-2 flex-wrap px-2 py-1 bg-surface-2/40 rounded"
                >
                  <span className="font-bold">{DOW_LABELS[u.day_of_week ?? 0]}</span>
                  <span className="font-mono text-ink-3">
                    {u.start_time?.slice(0, 5) ?? "—"} – {u.end_time?.slice(0, 5) ?? "—"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface text-ink-3 font-bold">
                    {u.reason ? REASON_LABELS[u.reason] ?? u.reason : "—"}
                  </span>
                  {u.notes ? <span className="italic text-ink-3">"{u.notes}"</span> : null}
                  <button
                    onClick={() => deleteItem(u.id)}
                    disabled={pending}
                    className="ml-auto text-danger hover:bg-danger-light rounded p-0.5"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-md border border-dashed border-line p-2 space-y-2 bg-surface-2/30">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Ajouter récurrente
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div>
                <Label htmlFor="rec_dow">Jour</Label>
                <select
                  id="rec_dow"
                  value={recDow}
                  onChange={(e) => setRecDow(e.target.value)}
                  className="w-full h-7 px-1 border border-line rounded text-xs"
                >
                  <option value="">— Choisir —</option>
                  <option value="1">Lundi</option>
                  <option value="2">Mardi</option>
                  <option value="3">Mercredi</option>
                  <option value="4">Jeudi</option>
                  <option value="5">Vendredi</option>
                  <option value="6">Samedi</option>
                  <option value="0">Dimanche</option>
                </select>
              </div>
              <div>
                <Label htmlFor="rec_start">Début</Label>
                <Input
                  id="rec_start"
                  type="time"
                  value={recStart}
                  onChange={(e) => setRecStart(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="rec_end">Fin</Label>
                <Input
                  id="rec_end"
                  type="time"
                  value={recEnd}
                  onChange={(e) => setRecEnd(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="rec_reason">Raison</Label>
                <select
                  id="rec_reason"
                  value={recReason}
                  onChange={(e) => setRecReason(e.target.value)}
                  className="w-full h-7 px-1 border border-line rounded text-xs"
                >
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="rec_notes">Note</Label>
                <Input
                  id="rec_notes"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="(optionnel)"
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div>
              <Button
                size="sm"
                variant="gold"
                onClick={addRecurring}
                disabled={pending}
              >
                <Plus className="h-3 w-3" /> Ajouter
              </Button>
            </div>
          </div>
        </div>

        {/* Specific */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-1.5">
            Absences ponctuelles
          </div>
          {specific.length === 0 ? (
            <p className="text-xs text-ink-3">Aucune absence ponctuelle déclarée.</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {specific.map((u) => (
                <li
                  key={u.id}
                  className="text-xs text-ink-2 flex items-center gap-2 flex-wrap px-2 py-1 bg-surface-2/40 rounded"
                >
                  <span className="font-bold">
                    {u.date_specific ? formatDate(u.date_specific) : "—"}
                  </span>
                  <span className="font-mono text-ink-3">
                    {u.start_time && u.end_time
                      ? `${u.start_time.slice(0, 5)} – ${u.end_time.slice(0, 5)}`
                      : "Journée"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface text-ink-3 font-bold">
                    {u.reason ? REASON_LABELS[u.reason] ?? u.reason : "—"}
                  </span>
                  {u.notes ? <span className="italic text-ink-3">"{u.notes}"</span> : null}
                  <button
                    onClick={() => deleteItem(u.id)}
                    disabled={pending}
                    className="ml-auto text-danger hover:bg-danger-light rounded p-0.5"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-md border border-dashed border-line p-2 space-y-2 bg-surface-2/30">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Ajouter absence ponctuelle
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div>
                <Label htmlFor="spec_date">Date</Label>
                <Input
                  id="spec_date"
                  type="date"
                  value={specDate}
                  onChange={(e) => setSpecDate(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="spec_start">Début (optionnel)</Label>
                <Input
                  id="spec_start"
                  type="time"
                  value={specStart}
                  onChange={(e) => setSpecStart(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="spec_end">Fin (optionnel)</Label>
                <Input
                  id="spec_end"
                  type="time"
                  value={specEnd}
                  onChange={(e) => setSpecEnd(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="spec_reason">Raison</Label>
                <select
                  id="spec_reason"
                  value={specReason}
                  onChange={(e) => setSpecReason(e.target.value)}
                  className="w-full h-7 px-1 border border-line rounded text-xs"
                >
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="spec_notes">Note</Label>
                <Input
                  id="spec_notes"
                  value={specNotes}
                  onChange={(e) => setSpecNotes(e.target.value)}
                  placeholder="(optionnel)"
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div>
              <Button
                size="sm"
                variant="gold"
                onClick={addSpecific}
                disabled={pending}
              >
                <Plus className="h-3 w-3" /> Ajouter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
