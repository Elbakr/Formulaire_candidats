"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { previewWeekAction, commitDraftsAction } from "../generate/actions";
import { toast } from "sonner";

type Draft = {
  employee_id: string;
  employee_name: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  hours: number;
};

type Uncovered = { employee_id: string; full_name: string; missing_hours: number };

export function GenerateWeekButton({ weekISO }: { weekISO: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uncovered, setUncovered] = useState<Uncovered[]>([]);

  function loadPreview() {
    setOpen(true);
    setDrafts([]);
    setUncovered([]);
    startTransition(async () => {
      try {
        const r = await previewWeekAction(weekISO);
        setDrafts(r.drafts);
        setUncovered(r.uncovered);
      } catch (e) {
        toast.error((e as Error).message);
        setOpen(false);
      }
    });
  }

  function commit() {
    startTransition(async () => {
      const r = await commitDraftsAction(drafts);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${r.created ?? 0} shifts créés.`);
        if (r.warnings && r.warnings.length > 0) {
          for (const w of r.warnings) {
            toast.warning(w, { duration: 8000 });
          }
        }
        setOpen(false);
        router.refresh();
      }
    });
  }

  // Group drafts by employee
  const byEmp = new Map<string, Draft[]>();
  for (const d of drafts) {
    const arr = byEmp.get(d.employee_id) ?? [];
    arr.push(d);
    byEmp.set(d.employee_id, arr);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={loadPreview} disabled={pending}>
        <Sparkles className="h-3.5 w-3.5" /> Générer la semaine
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aperçu de la semaine générée</DialogTitle>
            <DialogDescription>
              {pending && drafts.length === 0
                ? "Calcul en cours..."
                : `${drafts.length} shifts proposés pour ${byEmp.size} employés.${uncovered.length ? ` ${uncovered.length} couverture(s) incomplète(s).` : ""}`}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 max-h-[60vh] overflow-y-auto">
            {drafts.length === 0 && !pending ? (
              <p className="text-center text-sm text-ink-3 py-8">Aucun shift à proposer (employés en congé ou semaine déjà remplie).</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {Array.from(byEmp.entries()).map(([empId, emp]) => (
                  <li key={empId} className="border border-line rounded-md p-2">
                    <div className="font-bold mb-1">
                      {emp[0].employee_name}
                      <span className="text-ink-3 font-normal text-xs ml-2">
                        ({emp.length} shift{emp.length > 1 ? "s" : ""} ·{" "}
                        {emp.reduce((a, s) => a + s.hours, 0).toFixed(1)}h)
                      </span>
                    </div>
                    <div className="text-xs text-ink-2 space-y-0.5">
                      {emp.map((s, i) => (
                        <div key={i}>
                          {new Date(s.date).toLocaleDateString("fr-BE", { weekday: "short", day: "2-digit", month: "short" })} : {s.start_time} – {s.end_time} ({s.hours}h, pause {s.break_minutes}min)
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {uncovered.length > 0 ? (
              <div className="mt-4 p-3 bg-warn-light text-warn rounded-md text-xs">
                <div className="font-bold mb-1">Employés sous-couverts :</div>
                <ul>
                  {uncovered.map((u) => (
                    <li key={u.employee_id}>· {u.full_name} : {u.missing_hours.toFixed(1)}h manquantes</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter className="-mx-5 -mb-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              type="button"
              variant="gold"
              disabled={pending || drafts.length === 0}
              onClick={commit}
            >
              <Check className="h-4 w-4" /> {pending ? "…" : `Valider et créer ${drafts.length} shifts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
