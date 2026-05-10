"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordDimonaDeclarationAction } from "../contract-actions";

const KINDS = [
  { v: "IN", label: "IN — Entrée en service" },
  { v: "UPDATE", label: "UPDATE — Modification" },
  { v: "OUT", label: "OUT — Sortie" },
  { v: "CANCEL", label: "CANCEL — Annulation" },
];

const WORKER_TYPES = [
  { v: "OTH", label: "OTH — Travailleur ordinaire" },
  { v: "STU", label: "STU — Étudiant" },
  { v: "EXT", label: "EXT — Extra HORECA" },
  { v: "FLX", label: "FLX — Flexi-job" },
  { v: "TRI", label: "TRI — Intérim" },
];

export function DimonaForm({
  employeeId,
  defaultStartDate,
  defaultEndDate,
  contractId,
}: {
  employeeId: string;
  defaultStartDate: string | null;
  defaultEndDate: string | null;
  contractId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (contractId) fd.set("contract_id", contractId);
    startTransition(async () => {
      const r = await recordDimonaDeclarationAction(employeeId, fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Déclaration Dimona enregistrée.");
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="declaration_kind">Type de déclaration</Label>
          <select
            id="declaration_kind"
            name="declaration_kind"
            defaultValue="IN"
            className="flex h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="worker_type">Type de travailleur ONSS</Label>
          <select
            id="worker_type"
            name="worker_type"
            defaultValue="OTH"
            className="flex h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm"
          >
            {WORKER_TYPES.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="start_date">Date de début</Label>
          <Input
            type="date"
            id="start_date"
            name="start_date"
            defaultValue={defaultStartDate ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor="end_date">Date de fin (CDD uniquement)</Label>
          <Input
            type="date"
            id="end_date"
            name="end_date"
            defaultValue={defaultEndDate ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="reference_number">Numéro de référence ONSS</Label>
          <Input
            id="reference_number"
            name="reference_number"
            placeholder="DIM_XXXXXXXXX"
            required
          />
        </div>
        <div>
          <Label htmlFor="declared_at">Date de déclaration</Label>
          <Input
            type="datetime-local"
            id="declared_at"
            name="declared_at"
            defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Commentaires éventuels (optionnel)"
          rows={2}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="gold" disabled={pending}>
          <Save className="h-3.5 w-3.5" /> Enregistrer la déclaration
        </Button>
      </div>
    </form>
  );
}
