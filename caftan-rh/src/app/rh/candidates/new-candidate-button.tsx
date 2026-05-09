"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { createCandidateAction } from "../actions";
import { toast } from "sonner";

export function NewCandidateButton({ jobs }: { jobs: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [jobId, setJobId] = useState<string>("none");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus className="h-4 w-4" /> Nouveau candidat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un candidat manuellement</DialogTitle>
          <DialogDescription>Pour les candidatures reçues hors plateforme.</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            if (jobId !== "none") fd.set("job_id", jobId);
            startTransition(async () => {
              const res = await createCandidateAction(fd);
              if (res?.error) toast.error(res.error);
              else {
                toast.success("Candidat ajouté.");
                setOpen(false);
              }
            });
          }}
          className="space-y-3 px-5 py-3"
        >
          <div>
            <Label htmlFor="full_name">Nom complet</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>
          <div>
            <Label>Offre liée</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger>
                <SelectValue placeholder="Aucune (spontanée)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune (spontanée)</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="-mx-5 -mb-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "Ajout…" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
