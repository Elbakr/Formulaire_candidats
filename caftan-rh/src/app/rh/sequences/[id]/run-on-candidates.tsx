"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { runSequenceManuallyAction } from "../actions";
import { toast } from "sonner";

type ApplicationOption = { id: string; label: string };

export function RunOnCandidatesDialog({
  sequenceId,
  applications,
}: {
  sequenceId: string;
  applications: ApplicationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return applications;
    return applications.filter((a) => a.label.toLowerCase().includes(q));
  }, [applications, filter]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run() {
    const ids = Array.from(picked);
    if (ids.length === 0) {
      toast.error("Sélectionne au moins un candidat.");
      return;
    }
    start(async () => {
      const r = await runSequenceManuallyAction(sequenceId, ids);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(`${r.started ?? 0} exécution(s) démarrée(s).`);
        setOpen(false);
        setPicked(new Set());
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Play className="h-4 w-4" /> Lancer sur des candidats
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lancer la séquence</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3 space-y-3">
          <Input
            placeholder="Rechercher un candidat…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-[320px] overflow-y-auto border border-line rounded-md divide-y divide-line">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-ink-3 text-center">Aucun candidat trouvé.</div>
            ) : (
              filtered.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  <span className="flex-1 min-w-0 truncate">{a.label}</span>
                </label>
              ))
            )}
          </div>
          <p className="text-[11px] text-ink-3">
            Les candidatures qui ont déjà une exécution active de cette séquence seront ignorées.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="gold" disabled={pending} onClick={run}>
            {pending ? "..." : `Lancer (${picked.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
