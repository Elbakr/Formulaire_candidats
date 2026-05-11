"use client";

/**
 * Bouton "Reclassification douce" + dialog de preview/confirmation.
 *
 * Flux :
 *  1) Clic → exécution en `dryRun=true` → affiche le résumé.
 *  2) L'utilisateur tape "RECLASSIFIER" dans l'input → bouton "Appliquer" s'active.
 *  3) Clic Appliquer → exécution `dryRun=false`, toast, refresh.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reclassifyOvertimeAction,
  type ReclassifyResult,
  type ReclassifyParams,
} from "./actions";

export function ReclassifyButton({
  fromDate,
  toDate,
  employeeIds,
  size = "default",
  label = "Lancer la reclassification douce",
}: {
  fromDate: string;
  toDate: string;
  employeeIds?: string[] | null;
  size?: "sm" | "default";
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ReclassifyResult | null>(null);
  const [phrase, setPhrase] = useState("");
  const [running, startRun] = useTransition();

  const params: ReclassifyParams = {
    fromDate,
    toDate,
    employeeIds: employeeIds ?? null,
  };

  async function runPreview() {
    startRun(async () => {
      const r = await reclassifyOvertimeAction({ ...params, dryRun: true });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setPreview(r);
      setOpen(true);
      setPhrase("");
    });
  }

  async function runApply() {
    if (phrase.trim() !== "RECLASSIFIER") {
      toast.error("Tape exactement RECLASSIFIER pour confirmer.");
      return;
    }
    startRun(async () => {
      const r = await reclassifyOvertimeAction({ ...params, dryRun: false });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.shifts_reclassified} shifts reclassifiés (${r.hours_moved}h déplacées).`,
      );
      setOpen(false);
      setPreview(null);
      setPhrase("");
      router.refresh();
    });
  }

  const canApply = (preview?.shifts_reclassified ?? 0) > 0;
  const canConfirm = canApply && phrase.trim() === "RECLASSIFIER";

  return (
    <>
      <Button
        type="button"
        variant="gold"
        size={size}
        onClick={runPreview}
        disabled={running}
      >
        <Wand2 className="h-4 w-4" />
        {running && !open ? "Calcul…" : label}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !running && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Preview — Reclassification douce
            </DialogTitle>
            <DialogDescription>
              Aucune modification effectuée pour l&apos;instant. Vérifie les
              chiffres ci-dessous puis tape <strong>RECLASSIFIER</strong> et
              clique « Appliquer ».
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 space-y-4">
            {preview ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Kpi label="Employés impactés" value={preview.affected_employees} />
                  <Kpi label="Shifts à reclassifier" value={preview.shifts_reclassified} />
                  <Kpi
                    label="Heures déplacées"
                    value={`${preview.hours_moved.toFixed(1)}h`}
                  />
                </div>

                {preview.by_employee.length === 0 ? (
                  <div className="rounded-md border border-success-light bg-success-light/40 text-success p-3 text-sm">
                    Rien à reclassifier dans cette plage — tout est déjà
                    cohérent.
                  </div>
                ) : (
                  <div className="border border-line rounded-md max-h-[280px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-2 text-ink-3 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="text-left px-2 py-1.5">Employé</th>
                          <th className="text-left px-2 py-1.5">Semaine (lundi)</th>
                          <th className="text-right px-2 py-1.5">Shifts</th>
                          <th className="text-right px-2 py-1.5">Heures</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.by_employee.flatMap((e) =>
                          e.weeks.map((w, i) => (
                            <tr
                              key={`${e.employee_id}-${w.week_monday}`}
                              className="border-t border-line"
                            >
                              <td className="px-2 py-1.5">
                                {i === 0 ? (
                                  <span className="font-bold">{e.full_name}</span>
                                ) : (
                                  <span className="text-ink-3">"</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {w.week_monday}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {w.shifts_count}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {w.hours_moved.toFixed(1)}h
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {canApply ? (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-ink-2">
                      Tape <code className="bg-surface-2 px-1 rounded">RECLASSIFIER</code> pour confirmer :
                    </label>
                    <Input
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder="RECLASSIFIER"
                      autoFocus
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-ink-3">Calcul en cours…</div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={running}
            >
              Annuler
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={runApply}
              disabled={!canConfirm || running}
            >
              {running ? "Application…" : "Appliquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-bold">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
