"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  endEmployeeLeaveAction,
  cancelLeaveAction,
} from "@/app/planning/employees/[id]/leave-actions";

type Leave = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  auto_validation_reason: string | null;
  created_at: string;
};

export function ActiveLeavesList({
  leaves,
  todayISO,
}: {
  leaves: Leave[];
  todayISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [endValue, setEndValue] = useState("");

  function isOpen(end: string) {
    return end >= "9000-01-01";
  }

  function startClose(leave: Leave) {
    setEditing(leave.id);
    setEndValue(todayISO);
  }

  function applyClose(leave: Leave) {
    if (!endValue) {
      toast.error("Date de fin requise");
      return;
    }
    if (endValue < leave.start_date) {
      toast.error("La fin ne peut pas être avant le début");
      return;
    }
    startTransition(async () => {
      const r = await endEmployeeLeaveAction({ leaveId: leave.id, endDate: endValue });
      if (r.error) toast.error(r.error);
      else {
        toast.success(`Congé clôturé au ${endValue}`);
        setEditing(null);
        router.refresh();
      }
    });
  }

  function cancel(leave: Leave) {
    const dur = leave.end_date === leave.start_date ? "ce jour" : `${leave.start_date} → ${isOpen(leave.end_date) ? "sans fin" : leave.end_date}`;
    if (!window.confirm(`Annuler ce congé (${leave.kind} · ${dur}) ?`)) return;
    startTransition(async () => {
      const r = await cancelLeaveAction({ leaveId: leave.id });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Congé annulé");
        router.refresh();
      }
    });
  }

  return (
    <ul className="space-y-2 mt-2">
      {leaves.map((l) => {
        const open = isOpen(l.end_date);
        return (
          <li
            key={l.id}
            className={`rounded-md border p-2 ${open ? "border-danger/40 bg-white" : "border-line bg-white"}`}
          >
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold uppercase text-[10px] tracking-wider bg-surface-2 px-1.5 py-0.5 rounded">
                {l.kind}
              </span>
              <span className="font-mono">
                {l.start_date} → {open ? <strong className="text-danger">sans fin programmée</strong> : l.end_date}
              </span>
              <span className="text-ink-3">{l.status}</span>
              {l.reason ? <span className="text-ink-3">· {l.reason}</span> : null}
            </div>
            {editing === l.id ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={endValue}
                  onChange={(e) => setEndValue(e.target.value)}
                  className="h-9 rounded-md border border-line bg-surface px-2 text-sm font-mono"
                />
                <Button size="sm" onClick={() => applyClose(l)} disabled={pending}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Clôturer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={pending}>
                  Annuler
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startClose(l)}
                  disabled={pending}
                  className="h-7 text-xs"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {open ? "Clôturer (fixer la fin)" : "Modifier la fin"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancel(l)}
                  disabled={pending}
                  className="h-7 text-xs text-danger hover:bg-danger-light"
                >
                  <X className="h-3 w-3" />
                  Annuler complètement
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
