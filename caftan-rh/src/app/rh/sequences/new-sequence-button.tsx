"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSequenceAction } from "./actions";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/components/ui/badge";

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "manual", label: "Aucun (déclenchement manuel)" },
  ...(["new", "contacted", "rdv_scheduled", "rdv_done", "wait_decision", "hired", "refused"] as const).map(
    (v) => ({ value: v, label: STATUS_LABELS[v] ?? v }),
  ),
];

export function NewSequenceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [trigger, setTrigger] = useState<string>("manual");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus className="h-4 w-4" /> Nouvelle séquence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle séquence</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            fd.set("trigger_status", trigger);
            start(async () => {
              const r = await createSequenceAction(fd);
              if (r?.error) toast.error(r.error);
              else if (r?.ok && r.id) {
                toast.success("Séquence créée. Ajoute des étapes.");
                setOpen(false);
                router.push(`/rh/sequences/${r.id}`);
                router.refresh();
              }
            });
          }}
          className="space-y-3 px-5 py-3"
        >
          <div>
            <Label htmlFor="name">Nom *</Label>
            <Input id="name" name="name" required placeholder="ex. Pipeline standard" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div>
            <Label>Statut déclencheur</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-ink-3 mt-1">
              La séquence démarre quand une candidature passe à ce statut.
            </p>
          </div>
          <DialogFooter className="-mx-5 -mb-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "..." : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
