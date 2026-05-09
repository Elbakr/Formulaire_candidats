"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, RotateCcw, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import {
  toggleOnboardingItemAction,
  addCustomItemAction,
  removeItemAction,
  closeRunAction,
  reopenRunAction,
} from "../actions";
import type { RunItem } from "./page";

type Employee = {
  id: string;
  full_name: string;
  job_title: string | null;
  start_date: string;
  status: string;
  department: { id: string; name: string } | null;
};

type Run = {
  id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  admin: "Admin",
  tools: "Outils",
  training: "Formation",
  legal: "Légal",
};
const CATEGORY_COLORS: Record<string, string> = {
  admin: "bg-info-light text-info",
  tools: "bg-violet-light text-violet",
  training: "bg-gold-light text-gold-dark",
  legal: "bg-danger-light text-danger",
};
const ROLE_LABELS: Record<string, string> = {
  rh: "RH",
  manager: "Manager",
  employee: "Employé",
};

export function OnboardingDetail({
  employee,
  run,
  items,
  doneByMap,
}: {
  employee: Employee;
  run: Run;
  items: RunItem[];
  doneByMap: Record<string, string>;
}) {
  const router = useRouter();
  useRealtime("onboarding_run_items", () => router.refresh(), `run_id=eq.${run.id}`);
  useRealtime("onboarding_runs", () => router.refresh(), `id=eq.${run.id}`);

  const total = items.length;
  const done = items.filter((i) => i.done_at).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const days = Math.max(0, Math.floor((Date.now() - new Date(employee.start_date).getTime()) / 86400000));

  const grouped: Record<string, RunItem[]> = {};
  for (const it of items) {
    const cat = it.category ?? "admin";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(it);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b border-line">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold">{employee.full_name}</h1>
              <p className="text-sm text-ink-2">
                {employee.job_title ?? "—"} · {employee.department?.name ?? "Sans service"} · arrivée {formatDate(employee.start_date)} (J+{days})
              </p>
            </div>
            <div className="flex items-center gap-2">
              {run.completed_at ? (
                <>
                  <Badge variant="hired">Terminé · {formatDate(run.completed_at)}</Badge>
                  <ReopenButton runId={run.id} />
                </>
              ) : (
                <CloseRunButton runId={run.id} disabled={done < total && total > 0} />
              )}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ink-2 font-semibold">Progression : {done}/{total} items</span>
              <span className={cn(
                "font-mono font-extrabold",
                pct >= 100 ? "text-success" : pct >= 50 ? "text-gold-dark" : "text-warn",
              )}>{pct}%</span>
            </div>
            <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
              <div
                className={pct >= 100 ? "h-full bg-success" : pct >= 50 ? "h-full bg-gold" : "h-full bg-warn"}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center text-sm text-ink-3 py-8">Aucun item dans ce run.</div>
          ) : (
            Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn("text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full", CATEGORY_COLORS[cat] ?? "bg-surface-2 text-ink-2")}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {list.filter((i) => i.done_at).length}/{list.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {list.map((it) => (
                    <ItemRow
                      key={it.id}
                      item={it}
                      doneByName={it.done_by ? doneByMap[it.done_by] ?? null : null}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-line">
          <AddCustomItemDialog runId={run.id} />
        </div>
      </Card>
    </div>
  );
}

function ItemRow({ item, doneByName }: { item: RunItem; doneByName: string | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const r = await toggleOnboardingItemAction(item.id);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Supprimer l'item "${item.label}" ?`)) return;
    startTransition(async () => {
      const r = await removeItemAction(item.id);
      if (r?.error) toast.error(r.error);
      else { toast.success("Item supprimé."); router.refresh(); }
    });
  }

  return (
    <li className={cn(
      "flex items-start gap-3 p-2.5 rounded-md border-2 transition-colors",
      item.done_at ? "border-success-light bg-success-light/30" : "border-line bg-surface",
    )}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
          item.done_at
            ? "bg-success border-success text-white"
            : "border-line bg-surface hover:border-success",
        )}
        aria-label={item.done_at ? "Marquer comme non fait" : "Marquer comme fait"}
      >
        {item.done_at ? <Check className="h-3 w-3" /> : null}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-semibold", item.done_at && "line-through text-ink-3")}>
            {item.label}
          </span>
          <Badge variant="muted" className="text-[9px]">{ROLE_LABELS[item.responsible_role] ?? item.responsible_role}</Badge>
          {item.is_required ? (
            <Badge variant="gold" className="text-[9px]">Requis</Badge>
          ) : (
            <Badge variant="muted" className="text-[9px] opacity-60">Optionnel</Badge>
          )}
        </div>
        {item.description ? (
          <p className="text-xs text-ink-3 mt-0.5">{item.description}</p>
        ) : null}
        {item.done_at ? (
          <p className="text-[11px] text-success font-semibold mt-1 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Fait {formatDateTime(item.done_at)}{doneByName ? ` · par ${doneByName}` : ""}
          </p>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending} aria-label="Supprimer">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function CloseRunButton({ runId, disabled }: { runId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function close() {
    if (!confirm("Clôturer ce parcours d'onboarding ? Cela enverra une notification à l'employé et au manager.")) return;
    startTransition(async () => {
      const r = await closeRunAction(runId);
      if (r?.error) toast.error(r.error);
      else { toast.success("Onboarding clôturé."); router.refresh(); }
    });
  }
  return (
    <Button variant="gold" size="sm" onClick={close} disabled={pending}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {disabled ? "Clôturer (forcer)" : "Clôturer"}
    </Button>
  );
}

function ReopenButton({ runId }: { runId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function reopen() {
    startTransition(async () => {
      const r = await reopenRunAction(runId);
      if (r?.error) toast.error(r.error);
      else { toast.success("Onboarding rouvert."); router.refresh(); }
    });
  }
  return (
    <Button variant="outline" size="sm" onClick={reopen} disabled={pending}>
      <RotateCcw className="h-3.5 w-3.5" /> Rouvrir
    </Button>
  );
}

function AddCustomItemDialog({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    fd.set("run_id", runId);
    startTransition(async () => {
      const r = await addCustomItemAction(fd);
      if (r?.error) toast.error(r.error);
      else { toast.success("Item ajouté."); setOpen(false); router.refresh(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" /> Ajouter un item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nouvel item d'onboarding</DialogTitle>
        </DialogHeader>
        <form action={submit} className="p-5 space-y-3">
          <div>
            <Label htmlFor="label">Libellé *</Label>
            <Input id="label" name="label" required placeholder="ex. Visite médicale d'embauche" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Catégorie</Label>
              <Select name="category" defaultValue="admin">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="tools">Outils</SelectItem>
                  <SelectItem value="training">Formation</SelectItem>
                  <SelectItem value="legal">Légal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsable</Label>
              <Select name="responsible_role" defaultValue="rh">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rh">RH</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Employé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Obligatoire ?</Label>
              <Select name="is_required" defaultValue="true">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Requis</SelectItem>
                  <SelectItem value="false">Optionnel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Annuler</Button>
            </DialogClose>
            <Button type="submit" variant="gold" disabled={pending}>
              {pending ? "Ajout…" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
