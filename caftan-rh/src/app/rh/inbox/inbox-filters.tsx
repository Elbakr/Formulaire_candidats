"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tous types" },
  { value: "reply_draft", label: "Brouillon de réponse" },
  { value: "status_change", label: "Changement de statut" },
  { value: "send_template", label: "Envoi template" },
  { value: "assign_manager", label: "Affectation manager" },
  { value: "doc_classify", label: "Classification document" },
  { value: "candidate_scoring", label: "Scoring candidat" },
  { value: "spam_archive", label: "Archivage spam" },
  { value: "follow_up", label: "Relance" },
];

const TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes cibles" },
  { value: "application", label: "Candidature" },
  { value: "candidate", label: "Candidat" },
  { value: "employee", label: "Employé" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "proposed", label: "À valider" },
  { value: "approved", label: "Approuvées" },
  { value: "rejected", label: "Rejetées" },
  { value: "executed", label: "Exécutées" },
  { value: "expired", label: "Expirées" },
  { value: "all", label: "Tous statuts" },
];

export function InboxFilters({
  status,
  kind,
  targetType,
  fromValue,
  toValue,
}: {
  status: string;
  kind: string;
  targetType: string;
  fromValue: string;
  toValue: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(updates: Partial<{ status: string; kind: string; target_type: string; from: string; to: string }>) {
    const params = new URLSearchParams(window.location.search);
    const next = {
      status: updates.status ?? status,
      kind: updates.kind ?? kind,
      target_type: updates.target_type ?? targetType,
      from: updates.from ?? fromValue,
      to: updates.to ?? toValue,
    };
    params.delete("page");
    if (next.status && next.status !== "proposed") params.set("status", next.status);
    else params.delete("status");
    if (next.kind && next.kind !== "all") params.set("kind", next.kind);
    else params.delete("kind");
    if (next.target_type && next.target_type !== "all") params.set("target_type", next.target_type);
    else params.delete("target_type");
    if (next.from) params.set("from", next.from);
    else params.delete("from");
    if (next.to) params.set("to", next.to);
    else params.delete("to");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `?${qs}` : "?"));
  }

  function reset() {
    startTransition(() => router.push("?"));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <div>
        <Label className="text-[11px]">Statut</Label>
        <Select value={status} onValueChange={(v) => apply({ status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px]">Type d&apos;action</Label>
        <Select value={kind} onValueChange={(v) => apply({ kind: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px]">Cible</Label>
        <Select value={targetType} onValueChange={(v) => apply({ target_type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px]">Du</Label>
        <Input type="date" defaultValue={fromValue} onBlur={(e) => apply({ from: e.target.value })} />
      </div>

      <div>
        <Label className="text-[11px]">Au</Label>
        <Input type="date" defaultValue={toValue} onBlur={(e) => apply({ to: e.target.value })} />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
          Réinitialiser
        </Button>
      </div>
    </div>
  );
}
