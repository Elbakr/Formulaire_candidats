"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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
  { value: "no_show_streak", label: "Absences répétées" },
  { value: "score_drop", label: "Score en chute" },
  { value: "overdue_onboarding", label: "Onboarding en retard" },
  { value: "student_quota_near", label: "Quota étudiant proche" },
  { value: "cdd_ending", label: "Fin de CDD" },
  { value: "trial_decision_due", label: "Décision essai" },
  { value: "shift_uncovered", label: "Shift non couvert" },
  { value: "ghost_employee", label: "Employé sans activité" },
];

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes sévérités" },
  { value: "critical", label: "Critique" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

const TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes cibles" },
  { value: "employee", label: "Employé" },
  { value: "application", label: "Candidature" },
  { value: "shift", label: "Shift" },
  { value: "department", label: "Service" },
];

export function AnomaliesFilters({
  severity,
  kind,
  targetType,
}: {
  severity: string;
  kind: string;
  targetType: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(updates: Partial<{ severity: string; kind: string; target_type: string }>) {
    const params = new URLSearchParams(window.location.search);
    const next = {
      severity: updates.severity ?? severity,
      kind: updates.kind ?? kind,
      target_type: updates.target_type ?? targetType,
    };
    if (next.severity && next.severity !== "all") params.set("severity", next.severity);
    else params.delete("severity");
    if (next.kind && next.kind !== "all") params.set("kind", next.kind);
    else params.delete("kind");
    if (next.target_type && next.target_type !== "all") params.set("target_type", next.target_type);
    else params.delete("target_type");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `?${qs}` : "?"));
  }

  function reset() {
    startTransition(() => router.push("?"));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <div>
        <Label className="text-[11px]">Sévérité</Label>
        <Select value={severity} onValueChange={(v) => apply({ severity: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[11px]">Type</Label>
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
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
          Réinitialiser
        </Button>
      </div>
    </div>
  );
}
