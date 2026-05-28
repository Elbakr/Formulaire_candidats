"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plane,
  CalendarOff,
  CheckCircle2,
  X,
  ChevronLeft,
  Loader2,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NameAvatar } from "@/components/ui/avatar";
import { markEmployeeOnLeaveAction } from "@/app/planning/employees/[id]/leave-actions";
import {
  toggleRecurringUnavailAction,
  addSpecificUnavailAction,
  deleteUnavailAction,
} from "./actions";

type Employee = { id: string; full_name: string; job_title: string | null };
type Unavail = {
  id: string;
  employee_id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string;
  end_time: string;
  reason: string | null;
  is_active: boolean;
};
type Leave = {
  id: string;
  employee_id: string;
  kind: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

const DAYS_LABEL = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function toRange(slot: "am" | "pm" | "full") {
  return slot === "am"
    ? { start: "08:00", end: "12:30" }
    : slot === "pm"
      ? { start: "12:30", end: "20:00" }
      : { start: "00:00", end: "23:59" };
}

function matchSlot(start: string, end: string, slot: "am" | "pm" | "full") {
  const r = toRange(slot);
  return start.startsWith(r.start) && end.startsWith(r.end);
}

export function QuickAvailabilityClient({
  employees,
  unavails,
  leaves,
  todayISO,
}: {
  employees: Employee[];
  unavails: Unavail[];
  leaves: Leave[];
  todayISO: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(qq) ||
        (e.job_title ?? "").toLowerCase().includes(qq),
    );
  }, [employees, q]);

  if (selected) {
    return (
      <EmployeeQuickEdit
        employee={selected}
        unavails={unavails.filter((u) => u.employee_id === selected.id)}
        leaves={leaves.filter((l) => l.employee_id === selected.id)}
        todayISO={todayISO}
        onBack={() => {
          setSelected(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-3 max-w-md mx-auto pb-20">
      <header className="sticky top-0 bg-bg/95 backdrop-blur-sm border-b border-line z-10 px-2 py-3 -mx-2">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-2">
          📋 Dispos & Absences
        </h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un employé…"
            className="w-full h-12 rounded-lg border border-line bg-surface pl-10 pr-3 text-base"
            autoFocus
          />
        </div>
        <p className="text-[11px] text-ink-3 mt-1">
          Tape un nom, puis tap sur la carte pour régler dispos/congé.
        </p>
      </header>

      <div className="space-y-2">
        {filtered.map((e) => {
          const onLeave = leaves.some(
            (l) =>
              l.employee_id === e.id &&
              l.start_date <= todayISO &&
              l.end_date >= todayISO &&
              l.status === "approved",
          );
          const nbUnavail = unavails.filter(
            (u) => u.employee_id === e.id && u.is_active,
          ).length;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="w-full text-left p-3 rounded-lg border border-line bg-surface hover:bg-surface-2 active:scale-[0.99] transition-all flex items-center gap-3"
            >
              <NameAvatar fullName={e.full_name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{e.full_name}</div>
                <div className="text-xs text-ink-3 truncate">
                  {e.job_title ?? "—"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {onLeave ? (
                  <span className="text-[10px] bg-warn text-white font-bold px-1.5 py-0.5 rounded">
                    EN CONGÉ
                  </span>
                ) : null}
                {nbUnavail > 0 ? (
                  <span className="text-[10px] bg-info-light text-info font-bold px-1.5 py-0.5 rounded">
                    {nbUnavail} indispo
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-3 italic">
            Aucun employé trouvé pour "{q}"
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function EmployeeQuickEdit({
  employee,
  unavails,
  leaves,
  todayISO,
  onBack,
}: {
  employee: Employee;
  unavails: Unavail[];
  leaves: Leave[];
  todayISO: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const recurring = unavails.filter((u) => u.day_of_week != null && u.is_active);
  const specific = unavails.filter((u) => u.date_specific != null && u.is_active);
  const activeLeave = leaves.find(
    (l) => l.start_date <= todayISO && l.end_date >= todayISO && l.status === "approved",
  );

  function hasRecurring(dow: number, slot: "am" | "pm" | "full") {
    return recurring.some(
      (u) =>
        u.day_of_week === dow &&
        matchSlot(u.start_time, u.end_time, slot),
    );
  }

  function toggleRecur(dow: number, slot: "am" | "pm" | "full") {
    startTransition(async () => {
      const r = await toggleRecurringUnavailAction({
        employeeId: employee.id,
        dayOfWeek: dow,
        slot,
      });
      if (r.error) toast.error(r.error);
      else toast.success(`${DAYS_LABEL[dow]} ${slot.toUpperCase()} : ${r.action === "disabled" ? "dispo" : "indispo"}`);
      router.refresh();
    });
  }

  function deleteOne(id: string) {
    startTransition(async () => {
      const r = await deleteUnavailAction({ id });
      if (r.error) toast.error(r.error);
      else toast.success("Supprimé");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 max-w-md mx-auto pb-20">
      <header className="sticky top-0 bg-bg/95 backdrop-blur-sm border-b border-line z-10 px-2 py-3 -mx-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-surface-2 active:scale-95 transition-all"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <NameAvatar fullName={employee.full_name} size="md" />
          <div className="min-w-0">
            <div className="font-bold truncate">{employee.full_name}</div>
            <div className="text-[11px] text-ink-3 truncate">
              {employee.job_title ?? "—"}
            </div>
          </div>
        </div>
      </header>

      {activeLeave ? (
        <Card className="border-l-4 border-l-warn bg-warn-light/30">
          <div className="p-3 text-sm">
            <div className="font-bold flex items-center gap-1">
              <Plane className="h-4 w-4 text-warn" /> En congé actuellement
            </div>
            <div className="text-xs mt-0.5">
              {activeLeave.kind} · {activeLeave.start_date} →{" "}
              {activeLeave.end_date === "9999-12-31" ? "sans fin" : activeLeave.end_date}
              {activeLeave.reason ? ` · ${activeLeave.reason}` : ""}
            </div>
          </div>
        </Card>
      ) : null}

      <LeaveQuickForm employeeId={employee.id} employeeName={employee.full_name} todayISO={todayISO} onDone={() => router.refresh()} />

      <Card>
        <div className="p-3 border-b border-line bg-surface-2">
          <div className="font-bold text-sm">Indispos récurrentes</div>
          <div className="text-[11px] text-ink-3">
            Tap une case pour basculer dispo ↔ indispo (chaque semaine).
          </div>
        </div>
        <div className="p-2">
          <table className="w-full text-center">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                <th className="p-1"></th>
                {DAYS_LABEL.map((d, i) => (
                  <th key={i} className="p-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["am", "pm", "full"] as const).map((slot) => (
                <tr key={slot}>
                  <td className="text-[10px] uppercase font-bold text-ink-3">
                    {slot}
                  </td>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const isOff = hasRecurring(dow, slot);
                    return (
                      <td key={dow} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => toggleRecur(dow, slot)}
                          disabled={pending}
                          className={`w-full aspect-square rounded font-bold text-lg transition-all active:scale-90 ${
                            isOff
                              ? "bg-danger text-white"
                              : "bg-surface-2 text-ink-3 hover:bg-success-light hover:text-success"
                          }`}
                        >
                          {isOff ? "✕" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="p-3 border-b border-line bg-surface-2 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">Indispos ponctuelles</div>
            <div className="text-[11px] text-ink-3">
              {specific.length} prévues ({specific.length === 0 ? "aucune" : "60 prochains jours"})
            </div>
          </div>
        </div>
        <SpecificAddForm employeeId={employee.id} onDone={() => router.refresh()} />
        {specific.length > 0 ? (
          <ul className="divide-y divide-line">
            {specific
              .sort((a, b) => (a.date_specific! < b.date_specific! ? -1 : 1))
              .map((u) => (
                <li key={u.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-mono text-sm">{u.date_specific}</div>
                    <div className="text-[11px] text-ink-3">
                      {u.start_time.slice(0, 5)}–{u.end_time.slice(0, 5)}
                      {u.reason ? ` · ${u.reason}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteOne(u.id)}
                    disabled={pending}
                    className="p-2 rounded-full hover:bg-danger-light text-danger active:scale-90 transition-all"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

function LeaveQuickForm({
  employeeId,
  employeeName,
  todayISO,
  onDone,
}: {
  employeeId: string;
  employeeName: string;
  todayISO: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(todayISO);
  const [end, setEnd] = useState("");
  const [kind, setKind] = useState<"sick" | "vacation" | "personal" | "unpaid" | "other">("sick");
  const [removeShifts, setRemoveShifts] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full p-4 rounded-lg border-2 border-dashed border-gold/40 bg-gold-light/40 hover:bg-gold-light/70 active:scale-[0.99] transition-all flex items-center gap-3 font-bold"
      >
        <Plane className="h-5 w-5 text-gold-dark" />
        <span>Mettre {employeeName.split(" ")[0]} en congé</span>
      </button>
    );
  }

  function submit() {
    startTransition(async () => {
      const r = await markEmployeeOnLeaveAction({
        employeeId,
        startDate: start,
        endDate: end || null,
        kind,
        deleteShiftsInRange: removeShifts,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Congé enregistré", { duration: 5000 });
      setOpen(false);
      setEnd("");
      onDone();
    });
  }

  return (
    <Card className="border-l-4 border-l-gold">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold flex items-center gap-1">
            <Plane className="h-4 w-4 text-gold-dark" /> Nouveau congé
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-full hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {([
            ["sick", "Maladie"],
            ["vacation", "Congé"],
            ["personal", "Perso"],
            ["unpaid", "Sans solde"],
            ["other", "Autre"],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`py-2 rounded-md text-xs font-bold transition-colors ${
                kind === k ? "bg-gold text-[#1a1a0d]" : "bg-surface-2 text-ink-2"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">Début</div>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full h-11 rounded-md border border-line bg-surface px-2 text-sm font-mono"
            />
          </label>
          <label>
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
              Fin <span className="font-normal">(facultatif)</span>
            </div>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full h-11 rounded-md border border-line bg-surface px-2 text-sm font-mono"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={removeShifts}
            onChange={(e) => setRemoveShifts(e.target.checked)}
          />
          Supprimer les shifts pendant la période
        </label>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !start}
          className="w-full h-12 text-base"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Valider le congé
        </Button>
      </div>
    </Card>
  );
}

function SpecificAddForm({
  employeeId,
  onDone,
}: {
  employeeId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<"am" | "pm" | "full">("full");
  const [reason, setReason] = useState("");

  function submit() {
    if (!date) {
      toast.error("Date requise");
      return;
    }
    startTransition(async () => {
      const r = await addSpecificUnavailAction({
        employeeId,
        date,
        slot,
        reason: reason || null,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Indispo ajoutée");
        setDate("");
        setReason("");
        setOpen(false);
        onDone();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full p-3 border-b border-line text-sm font-bold text-gold-dark hover:bg-gold-light/30 active:scale-[0.99] transition-all flex items-center justify-center gap-1"
      >
        <Plus className="h-4 w-4" /> Ajouter une indispo ponctuelle
      </button>
    );
  }

  return (
    <div className="p-3 space-y-2 border-b border-line bg-surface-2/50">
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm">Nouvelle indispo</div>
        <button type="button" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full h-11 rounded-md border border-line bg-surface px-2 text-sm font-mono"
      />
      <div className="grid grid-cols-3 gap-1">
        {(["am", "pm", "full"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={`py-2 rounded-md text-xs font-bold ${
              slot === s ? "bg-gold text-[#1a1a0d]" : "bg-surface-2 text-ink-2"
            }`}
          >
            {s === "am" ? "Matin" : s === "pm" ? "Après-midi" : "Journée"}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motif (optionnel)"
        className="w-full h-11 rounded-md border border-line bg-surface px-2 text-sm"
      />
      <Button onClick={submit} disabled={pending || !date} className="w-full h-11">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Ajouter
      </Button>
    </div>
  );
}
