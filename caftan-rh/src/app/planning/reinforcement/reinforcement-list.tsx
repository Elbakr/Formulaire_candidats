"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  cancelReinforcementAction,
  listReinforcementCandidatesAction,
  proposeReinforcementAction,
  type ReinforcementCandidate,
  type ReinforcementRequestRow,
} from "./actions";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open: { label: "Ouverte", cls: "bg-warn-light text-warn" },
  sent_to_employee: { label: "En attente employé", cls: "bg-info-light text-info" },
  accepted: { label: "Acceptée", cls: "bg-success-light text-success" },
  declined: { label: "Déclinée", cls: "bg-danger-light text-danger" },
  covered: { label: "Couverte", cls: "bg-success-light text-success" },
  cancelled: { label: "Annulée", cls: "bg-surface-2 text-ink-3" },
  expired: { label: "Expirée", cls: "bg-surface-2 text-ink-3" },
};

export function ReinforcementList({
  requests,
}: {
  requests: ReinforcementRequestRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReinforcementCandidate[]>([]);

  const active = requests.filter((r) =>
    ["open", "sent_to_employee", "declined"].includes(r.status),
  );
  const recent = requests.filter(
    (r) => !["open", "sent_to_employee", "declined"].includes(r.status),
  );

  function loadCandidates(id: string) {
    setActiveId(id);
    setCandidates([]);
    startTransition(async () => {
      const r = await listReinforcementCandidatesAction(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setCandidates(r.candidates ?? []);
    });
  }

  function doPropose(employeeId: string) {
    if (!activeId) return;
    startTransition(async () => {
      const r = await proposeReinforcementAction({
        requestId: activeId,
        employeeId,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Proposition envoyée.");
      setActiveId(null);
      setCandidates([]);
      router.refresh();
    });
  }

  function doCancel(id: string) {
    startTransition(async () => {
      const r = await cancelReinforcementAction(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Demande annulée.");
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return (
      <Card>
        <div className="p-4 text-sm text-ink-3 text-center">
          Aucune demande de renfort. Crée-en une via le formulaire ci-dessous.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {active.length > 0 ? (
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-2">
            <h2 className="font-bold text-sm">Demandes actives ({active.length})</h2>
          </div>
          <ul className="divide-y divide-line">
            {active.map((r) => {
              const lab = STATUS_LABELS[r.status] ?? {
                label: r.status,
                cls: "bg-surface-2 text-ink-3",
              };
              return (
                <li key={r.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${lab.cls}`}
                    >
                      {lab.label}
                    </span>
                    <span className="font-bold text-sm">
                      {r.site_code} — {r.site_name}
                    </span>
                    <span className="text-xs text-ink-2">
                      {r.date} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                    </span>
                    {r.position ? (
                      <span className="text-xs text-ink-3">{r.position}</span>
                    ) : null}
                    {r.proposed_employee_name ? (
                      <span className="text-xs text-info ml-auto">
                        Proposé à {r.proposed_employee_name}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === "open" || r.status === "declined" ? (
                      <Button
                        size="sm"
                        variant="gold"
                        disabled={pending}
                        onClick={() => loadCandidates(r.id)}
                        className="min-h-[40px]"
                      >
                        {r.status === "declined"
                          ? "Proposer à un autre"
                          : "Voir candidats"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => doCancel(r.id)}
                    >
                      Annuler
                    </Button>
                  </div>
                  {activeId === r.id ? (
                    <div className="border border-line rounded-md mt-2 overflow-hidden">
                      <div className="px-3 py-2 bg-surface-2 text-xs font-bold uppercase tracking-wider">
                        Candidats — proximité → heures restantes
                      </div>
                      {candidates.length === 0 ? (
                        <div className="p-3 text-xs text-ink-3">
                          {pending ? "Chargement…" : "Aucun candidat trouvé."}
                        </div>
                      ) : (
                        <ul className="divide-y divide-line max-h-[320px] overflow-y-auto">
                          {candidates.map((c) => (
                            <li
                              key={c.employee_id}
                              className={`p-2 flex items-center gap-2 text-xs ${
                                c.has_conflict ? "bg-surface-2 opacity-60" : ""
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-bold truncate">
                                  {c.employee_name}
                                </div>
                                <div className="text-ink-3 text-[10px]">
                                  {c.job_title ?? "—"} ·{" "}
                                  {c.tier === 1
                                    ? "primary"
                                    : c.tier === 2
                                      ? "secondary"
                                      : "external"}
                                </div>
                              </div>
                              <div className="font-mono text-right text-ink-2 text-[10px]">
                                {c.distance_km == null
                                  ? "— km"
                                  : `${c.distance_km.toFixed(1)} km`}
                                <br />
                                {c.remaining_hours.toFixed(1)}h
                              </div>
                              {c.has_conflict ? (
                                <span className="px-1.5 py-0.5 rounded bg-warn-light text-warn text-[9px] font-bold">
                                  {c.reason_blocked ?? "Bloqué"}
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="gold"
                                  disabled={pending}
                                  onClick={() => doPropose(c.employee_id)}
                                  className="min-h-[36px]"
                                >
                                  Proposer
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold text-sm">Récentes (résolues)</h2>
          </div>
          <ul className="divide-y divide-line text-xs">
            {recent.slice(0, 10).map((r) => {
              const lab = STATUS_LABELS[r.status] ?? {
                label: r.status,
                cls: "bg-surface-2 text-ink-3",
              };
              return (
                <li key={r.id} className="p-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${lab.cls}`}
                  >
                    {lab.label}
                  </span>
                  <span className="font-bold">
                    {r.site_code} — {r.date} {r.start_time.slice(0, 5)}–
                    {r.end_time.slice(0, 5)}
                  </span>
                  {r.proposed_employee_name ? (
                    <span className="text-ink-3">→ {r.proposed_employee_name}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
