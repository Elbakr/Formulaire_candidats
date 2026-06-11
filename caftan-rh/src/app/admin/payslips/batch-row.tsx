"use client";

import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteBatchAction } from "./actions";
import { toast } from "sonner";

interface Batch {
  id: string;
  source_filename: string | null;
  status: string | null;
  payslips_count: number | null;
  created_at: string;
}

export function BatchRow({ batch }: { batch: Batch }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant={batch.status === "completed" ? "hired" : batch.status === "failed" ? "refused" : "muted"}>
          {batch.status}
        </Badge>
        <span className="font-mono text-xs truncate">{batch.source_filename ?? "—"}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          {batch.payslips_count ?? 0} fiches · {new Date(batch.created_at).toLocaleString("fr-BE")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          title="Supprimer ce batch et ses fiches (pour re-droper)"
          onClick={() => {
            if (!confirm(`Supprimer le batch "${batch.source_filename ?? batch.id}" et ses ${batch.payslips_count ?? 0} fiches ?`)) return;
            startTransition(async () => {
              const res = await deleteBatchAction(batch.id);
              if (res.ok) toast.success("Batch supprimé");
              else toast.error(res.error ?? "Erreur");
            });
          }}
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-600" />}
        </Button>
      </div>
    </div>
  );
}
