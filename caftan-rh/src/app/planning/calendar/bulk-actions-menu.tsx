"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  copyWeekFromPreviousAction,
  copyWeekToNextAction,
} from "./bulk-actions";

type Confirm =
  | { kind: "copy-prev"; count: number }
  | { kind: "copy-next"; count: number };

export function BulkActionsMenu({ weekISO }: { weekISO: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  function copyFromPrev(force = false) {
    startTransition(async () => {
      const r = await copyWeekFromPreviousAction({ weekISO, force });
      if (r?.error) toast.error(r.error);
      else if (r?.needsConfirm) setConfirm({ kind: "copy-prev", count: r.count ?? 0 });
      else if (r?.ok) {
        toast.success(`${r.copied ?? 0} shifts copiés depuis S-1.`);
        setConfirm(null);
        router.refresh();
      }
    });
  }

  function copyToNext(force = false) {
    startTransition(async () => {
      const r = await copyWeekToNextAction({ weekISO, force });
      if (r?.error) toast.error(r.error);
      else if (r?.needsConfirm) setConfirm({ kind: "copy-next", count: r.count ?? 0 });
      else if (r?.ok) {
        toast.success(`${r.copied ?? 0} shifts copiés vers S+1.`);
        setConfirm(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            Copier semaine <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Copier les shifts</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => copyFromPrev(false)}>
            <Copy className="h-3.5 w-3.5" /> Copier depuis S-1
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyToNext(false)}>
            <ArrowRightCircle className="h-3.5 w-3.5" /> Copier vers S+1
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm ? (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {confirm.kind === "copy-prev"
                  ? "Écraser les shifts existants ?"
                  : "Écraser la semaine suivante ?"}
              </DialogTitle>
              <DialogDescription>
                {`${confirm.count} shifts existent déjà. Confirme pour les remplacer.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirm(null)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  confirm.kind === "copy-prev" ? copyFromPrev(true) : copyToNext(true)
                }
              >
                Remplacer
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
