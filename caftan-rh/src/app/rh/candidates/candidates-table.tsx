"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRealtime } from "@/hooks/use-realtime";
import { PIPELINE_STAGES } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import type { ApplicationListItem } from "@/lib/queries";
import type { ApplicationStatus } from "@/types/database.types";

export function CandidatesTable({ initialData }: { initialData: ApplicationListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useRealtime("applications", () => router.refresh());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialData.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.candidate.full_name.toLowerCase().includes(q) ||
        a.candidate.email.toLowerCase().includes(q) ||
        (a.job?.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialData, search, statusFilter]);

  return (
    <Card>
      <div className="p-3 flex items-center gap-2 flex-wrap border-b border-line">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <Input
            placeholder="Rechercher nom, email, offre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-ink-3">Aucune candidature trouvée.</div>
      ) : (
        <div className="divide-y divide-line">
          {filtered.map((app) => (
            <Link
              key={app.id}
              href={`/rh/candidates/${app.id}`}
              className="flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors"
            >
              <NameAvatar name={app.candidate.full_name} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{app.candidate.full_name}</div>
                <div className="text-xs text-ink-3 truncate flex items-center gap-2">
                  <span>{app.candidate.email}</span>
                  {app.candidate.city ? <span>· {app.candidate.city}</span> : null}
                </div>
              </div>
              <div className="hidden md:block text-xs text-ink-2 max-w-[160px] truncate">
                {app.job?.title ?? "Spontanée"}
              </div>
              <div className="text-[11px] text-ink-3 hidden sm:block">{formatDate(app.updated_at)}</div>
              <Badge variant={app.status as ApplicationStatus}>{STATUS_LABELS[app.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
