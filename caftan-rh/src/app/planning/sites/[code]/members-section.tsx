"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import {
  assignEmployeeToSiteAction,
  endAssignmentAction,
} from "@/app/planning/employees/[id]/site-actions";

type Member = {
  assignment_id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  is_primary: boolean;
  start_date: string;
};

type EligibleEmployee = {
  id: string;
  full_name: string;
  job_title: string | null;
};

export function MembersSection({
  siteId,
  members,
  eligible,
}: {
  siteId: string;
  members: Member[];
  eligible: EligibleEmployee[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  const todayISO = new Date().toISOString().slice(0, 10);
  const filtered = q
    ? eligible.filter((e) =>
        e.full_name.toLowerCase().includes(q.toLowerCase()),
      )
    : eligible.slice(0, 20);

  function add(employeeId: string) {
    startTransition(async () => {
      const r = await assignEmployeeToSiteAction({
        employeeId,
        siteId,
        startDate: todayISO,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affecté au site (et ajouté au groupe chat).");
        setAdding(false);
        setQ("");
        router.refresh();
      }
    });
  }

  function endNow(m: Member) {
    startTransition(async () => {
      const r = await endAssignmentAction({
        assignmentId: m.assignment_id,
        employeeId: m.employee_id,
        endDate: todayISO,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affectation clôturée.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2">
          <Users className="h-4 w-4 text-gold-dark" />
          Équipe du site ({members.length})
        </h2>
        <Button size="sm" onClick={() => setAdding(!adding)}>
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{" "}
          {adding ? "Annuler" : "Ajouter"}
        </Button>
      </div>

      {adding ? (
        <div className="p-3 border-b border-line bg-surface-2/30 space-y-2">
          <input
            type="text"
            placeholder="Rechercher un employé…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
          <ul className="max-h-60 overflow-y-auto divide-y divide-line border border-line rounded-md">
            {filtered.length === 0 ? (
              <li className="p-3 text-sm text-ink-3 italic text-center">
                Aucun employé trouvé.
              </li>
            ) : (
              filtered.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => add(e.id)}
                    disabled={pending}
                    className="w-full text-left p-2 hover:bg-surface-2 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <NameAvatar name={e.full_name} className="h-7 w-7 text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{e.full_name}</div>
                      <div className="text-xs text-ink-3 truncate">
                        {e.job_title ?? "—"}
                      </div>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-gold-dark" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="p-6 text-center text-sm text-ink-3 italic">
          Aucun employé affecté à ce site.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.assignment_id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <EmployeeQuickLink
                  employeeId={m.employee_id}
                  fullName={m.full_name}
                  withAvatar
                  avatarSize="md"
                  variant="block"
                  fullWidth
                  subtitle={
                    <>
                      {m.job_title ?? "—"} · depuis le{" "}
                      {new Date(m.start_date).toLocaleDateString("fr-BE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </>
                  }
                  suffix={
                    m.is_primary ? (
                      <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-gold-light text-gold-dark shrink-0">
                        Principal
                      </span>
                    ) : null
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => endNow(m)}
                disabled={pending}
              >
                Clôturer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
