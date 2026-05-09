"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createJobAction, toggleJobStatusAction, deleteJobAction } from "./actions";
import { toast } from "sonner";

type Job = {
  id: string;
  title: string;
  location: string | null;
  contract_type: string | null;
  is_open: boolean;
  department_id: string | null;
  department: { name: string } | null;
};

export function JobsManager({ initialJobs, departments }: { initialJobs: Job[]; departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [deptId, setDeptId] = useState<string>("none");

  function toggle(jobId: string, isOpen: boolean) {
    startTransition(async () => {
      const r = await toggleJobStatusAction(jobId, !isOpen);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function destroy(jobId: string) {
    if (!confirm("Supprimer cette offre ?")) return;
    startTransition(async () => {
      const r = await deleteJobAction(jobId);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Offre supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="p-3 border-b border-line flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="gold"><Plus className="h-4 w-4" /> Nouvelle offre</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle offre</DialogTitle>
            </DialogHeader>
            <form
              action={(fd) => {
                if (deptId !== "none") fd.set("department_id", deptId);
                startTransition(async () => {
                  const r = await createJobAction(fd);
                  if (r?.error) toast.error(r.error);
                  else {
                    toast.success("Offre publiée.");
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
              className="space-y-3 px-5 py-3"
            >
              <div>
                <Label htmlFor="title">Intitulé *</Label>
                <Input id="title" name="title" required />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={4} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="location">Lieu</Label>
                  <Input id="location" name="location" />
                </div>
                <div>
                  <Label htmlFor="contract_type">Contrat</Label>
                  <Input id="contract_type" name="contract_type" placeholder="CDI, CDD…" />
                </div>
              </div>
              <div>
                <Label>Service</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="-mx-5 -mb-3 mt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : "Publier"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {initialJobs.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-3">Aucune offre. Crée la première !</div>
      ) : (
        <div className="divide-y divide-line">
          {initialJobs.map((j) => (
            <div key={j.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="font-bold">{j.title}</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  {j.department?.name ?? "—"} · {j.location ?? "—"} · {j.contract_type ?? "—"}
                </div>
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${j.is_open ? "bg-success-light text-success" : "bg-surface-2 text-ink-3"}`}>
                {j.is_open ? "Ouverte" : "Fermée"}
              </span>
              <Button size="sm" variant="outline" onClick={() => toggle(j.id, j.is_open)} disabled={pending}>
                {j.is_open ? <><EyeOff className="h-3.5 w-3.5" /> Fermer</> : <><Eye className="h-3.5 w-3.5" /> Rouvrir</>}
              </Button>
              <Button size="sm" variant="danger" onClick={() => destroy(j.id)} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
