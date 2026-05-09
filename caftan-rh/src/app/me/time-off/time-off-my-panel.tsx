"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRealtime } from "@/hooks/use-realtime";
import { requestTimeOffAction, cancelTimeOffAction } from "@/app/planning/actions";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const KIND_LABELS: Record<string, string> = {
  vacation: "Vacances",
  sick: "Maladie",
  personal: "Personnel",
  unpaid: "Sans solde",
  other: "Autre",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warn-light text-warn",
  approved: "bg-success-light text-success",
  rejected: "bg-danger-light text-danger",
  cancelled: "bg-surface-2 text-ink-3",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

type Req = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
};

export function TimeOffMyPanel({ employeeId, requests }: { employeeId: string; requests: Req[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState("vacation");

  useRealtime("time_off_requests", () => router.refresh(), `employee_id=eq.${employeeId}`);

  function cancel(id: string) {
    if (!confirm("Annuler cette demande ?")) return;
    startTransition(async () => {
      const r = await cancelTimeOffAction(id);
      if (r?.error) toast.error(r.error);
      else toast.success("Demande annulée.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <form
          ref={formRef}
          action={(fd) => {
            fd.set("kind", kind);
            startTransition(async () => {
              const r = await requestTimeOffAction(fd);
              if (r?.error) toast.error(r.error);
              else {
                toast.success("Demande envoyée.");
                formRef.current?.reset();
              }
            });
          }}
          className="p-4 grid md:grid-cols-2 gap-3 items-end"
        >
          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1" />
          <div>
            <Label htmlFor="start_date">Du</Label>
            <Input id="start_date" name="start_date" type="date" required />
          </div>
          <div>
            <Label htmlFor="end_date">Au</Label>
            <Input id="end_date" name="end_date" type="date" required />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="reason">Motif (optionnel)</Label>
            <Textarea id="reason" name="reason" rows={2} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="gold" disabled={pending}>
              <Plus className="h-4 w-4" /> {pending ? "Envoi…" : "Demander un congé"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">Mes demandes</h2>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">Aucune demande.</div>
        ) : (
          <div className="divide-y divide-line">
            {requests.map((r) => {
              const days = Math.round((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86_400_000) + 1;
              return (
                <div key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gold-light text-gold-dark">
                    {KIND_LABELS[r.kind] ?? r.kind}
                  </span>
                  <div className="flex-1 min-w-[200px] text-sm">
                    Du {formatDate(r.start_date)} au {formatDate(r.end_date)} ({days}j)
                    {r.reason ? <div className="text-xs text-ink-3 italic mt-0.5">"{r.reason}"</div> : null}
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.status === "pending" ? (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} disabled={pending}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
