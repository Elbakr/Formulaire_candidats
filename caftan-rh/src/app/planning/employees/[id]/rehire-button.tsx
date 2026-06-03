"use client";

// Karim 2026-06-03 : bouton "Réembaucher" sur fiche d'un ex-employé.
// Remet status=active, update start_date + end_date, conserve l'historique
// précédent (fiches paie, ruptures, etc.), et permet d envoyer un nouveau
// contrat avec les données existantes.

import { useState, useTransition } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { rehireEmployeeAction } from "./rehire-actions";

const todayPlus = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

export function RehireButton({ employeeId, employeeName, status }: {
  employeeId: string;
  employeeName: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [endDate, setEndDate] = useState(todayPlus(90));
  const [contractType, setContractType] = useState<string>("CDD");
  const [weeklyHours, setWeeklyHours] = useState<string>("19");
  const [note, setNote] = useState("");

  if (status === "active") return null; // déjà actif, pas besoin

  function submit() {
    startTransition(async () => {
      const r = await rehireEmployeeAction({
        employeeId,
        startDate,
        endDate,
        contractType,
        weeklyHours: parseInt(weeklyHours, 10),
        note: note || undefined,
      });
      if (r.ok) {
        toast.success("Réembauche enregistrée. L'historique précédent est conservé.");
        setOpen(false);
        window.location.reload();
      } else toast.error(r.error ?? "KO");
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-green-400 hover:bg-green-50">
        <RotateCcw className="h-3.5 w-3.5" /> Réembaucher
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réembauche — {employeeName}</DialogTitle>
            <DialogDescription>
              Crée un nouveau contrat pour cet ex-employé. Les données existantes
              (nom, NRN, IBAN, etc.) sont réutilisées. L&apos;historique précédent
              (fiches paie, ruptures, formations) est <strong>conservé intact</strong>.
              Pas besoin de refaire le questionnaire de profilage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Type de contrat</Label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface">
                  <option value="CDD">CDD</option>
                  <option value="Étudiant">Étudiant</option>
                  <option value="Intérim">Intérim</option>
                </select>
              </div>
              <div>
                <Label>Heures/semaine</Label>
                <Input type="number" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} min={1} max={48} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date début</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={todayPlus(0)} />
              </div>
              <div>
                <Label>Date fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
              </div>
            </div>
            <div>
              <Label>Note (raison réembauche)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder='Ex: "Renfort été", "Demande employé après rupture"...' />
            </div>
            <div className="text-[10px] text-ink-3 bg-blue-50 p-2 rounded">
              ✓ Status repassera à <strong>active</strong> · ✓ Skip questionnaire profilage · ✓ Historique préservé · ✓ Tu pourras envoyer le contrat directement après
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="gold" onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Réembaucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
