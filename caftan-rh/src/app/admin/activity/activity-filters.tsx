"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITY_KIND_LABELS } from "@/lib/activity-shared";

export function ActivityFilters({
  actors,
  actorValue,
  kindValue,
  fromValue,
  toValue,
  groups,
}: {
  actors: { id: string; full_name: string | null; email: string }[];
  actorValue: string;
  kindValue: string;
  fromValue: string;
  toValue: string;
  groups: { label: string; kinds: string[] }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(updates: Partial<{ actor: string; kind: string; from: string; to: string }>) {
    const params = new URLSearchParams(window.location.search);
    const next = {
      actor: updates.actor ?? actorValue,
      kind: updates.kind ?? kindValue,
      from: updates.from ?? fromValue,
      to: updates.to ?? toValue,
    };
    // page reset on filter change
    params.delete("page");
    if (next.actor && next.actor !== "all") params.set("actor", next.actor);
    else params.delete("actor");
    if (next.kind && next.kind !== "all") params.set("kind", next.kind);
    else params.delete("kind");
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <div>
        <Label className="text-[11px]">Auteur</Label>
        <Select value={actorValue} onValueChange={(v) => apply({ actor: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les auteurs</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name || a.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px]">Type d&apos;évènement</Label>
        <Select value={kindValue} onValueChange={(v) => apply({ kind: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 font-bold">
                  {g.label}
                </div>
                {g.kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ACTIVITY_KIND_LABELS[k] ?? k}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px]">Du</Label>
        <Input
          type="date"
          defaultValue={fromValue}
          onBlur={(e) => apply({ from: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-[11px]">Au</Label>
        <Input
          type="date"
          defaultValue={toValue}
          onBlur={(e) => apply({ to: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
          Réinitialiser
        </Button>
      </div>
    </div>
  );
}
