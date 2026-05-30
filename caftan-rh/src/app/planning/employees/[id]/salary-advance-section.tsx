"use client";

// Karim 2026-05-29 : section "Avance salariale" sur fiche employee.
// Le montant saisi sera deduit du net lors du prochain paiement de payslip,
// puis reset a 0 automatiquement apres confirmation paiement.

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, Save, Loader2 } from "lucide-react";
import { updateEmployeeAdvanceAction } from "@/app/admin/payslips/actions";
import { toast } from "sonner";

interface Props {
  employeeId: string;
  initialAmount: number;
  initialNote: string | null;
  updatedAt: string | null;
}

export function SalaryAdvanceSection({ employeeId, initialAmount, initialNote, updatedAt }: Props) {
  const [amount, setAmount] = useState(String(initialAmount));
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <div className="p-4 border-b border-line">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Avance salariale en cours
        </h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Le montant sera deduit du net de la prochaine fiche de paie payee, puis reset a 0.
          {updatedAt && (
            <span className="ml-2">
              Derniere maj : {new Date(updatedAt).toLocaleDateString("fr-BE")}
            </span>
          )}
        </p>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Montant (€)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Note (optionnel)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ex: avance demandee par WhatsApp le 15/05"
            maxLength={200}
          />
        </div>
      </div>
      <div className="px-4 pb-4 flex justify-end">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            const n = parseFloat(amount.replace(",", "."));
            if (!Number.isFinite(n) || n < 0) {
              toast.error("Montant invalide");
              return;
            }
            startTransition(async () => {
              const res = await updateEmployeeAdvanceAction(employeeId, n, note);
              if (res.ok) toast.success("Avance enregistree");
              else toast.error(res.error ?? "Erreur");
            });
          }}
        >
          {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
    </Card>
  );
}
