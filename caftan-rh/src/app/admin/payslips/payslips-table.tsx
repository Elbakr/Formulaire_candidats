"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, CheckCircle2, Mail, AlertCircle, Calendar, Loader2 } from "lucide-react";
import { markPayslipPaidAction, sendPayslipToEmployeeAction } from "./actions";
import { toast } from "sonner";

export interface PayslipRow {
  id: string;
  employee_id: string;
  employer_org_key: string;
  period_year: number;
  period_month: number;
  period_label: string | null;
  gross_amount: number | null;
  net_amount: number;
  advance_deducted: number;
  amount_to_pay: number;
  pdf_storage_path: string | null;
  pdf_filename: string | null;
  qr_png_data_url: string | null;
  qr_epc_payload: string | null;
  is_secondary: boolean;
  scheduled_payment_date: string | null;
  paired_with_payslip_id: string | null;
  payment_status: "pending" | "scheduled" | "paid" | "cancelled";
  paid_at: string | null;
  paid_amount: number | null;
  created_at: string;
  employee: {
    id: string;
    full_name: string;
    email: string | null;
    iban: string | null;
    preferred_language: string | null;
  };
}

const MONTH_NAMES_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export function PayslipsTable({ rows }: { rows: PayslipRow[] }) {
  // Group by year+month
  const groups = new Map<string, PayslipRow[]>();
  for (const r of rows) {
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const groupKeys = Array.from(groups.keys()).sort().reverse();

  return (
    <div className="space-y-4">
      {groupKeys.map((key) => {
        const [year, month] = key.split("-").map((x) => parseInt(x, 10));
        const items = groups.get(key)!;
        return (
          <Card key={key} className="p-0 overflow-hidden">
            <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
              <h2 className="font-semibold text-sm">
                {MONTH_NAMES_FR[month - 1]} {year}
              </h2>
              <span className="text-xs text-muted-foreground">{items.length} fiches</span>
            </div>
            <div className="divide-y">
              {items.map((row) => (
                <PayslipRowCard key={row.id} row={row} />
              ))}
            </div>
          </Card>
        );
      })}
      {rows.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          Aucune fiche de paie. Drop un PDF pour commencer.
        </div>
      )}
    </div>
  );
}

function PayslipRowCard({ row }: { row: PayslipRow }) {
  const todayLeq = row.scheduled_payment_date
    ? new Date(row.scheduled_payment_date).getTime() <= Date.now()
    : true;
  const isLocked = row.is_secondary && !todayLeq;
  const statusLabel = {
    pending: { label: "En attente", className: "bg-blue-100 text-blue-800" },
    scheduled: { label: `Différée → ${row.scheduled_payment_date ?? ""}`, className: "bg-amber-100 text-amber-800" },
    paid: { label: "Payée", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-800" },
  }[row.payment_status];

  return (
    <div className="p-4 flex items-center gap-3 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{row.employee.full_name}</span>
          {row.is_secondary && (
            <Badge variant="outline" className="text-xs">
              <Calendar className="w-3 h-3 mr-1" />
              Secondaire
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span>Net : {Number(row.net_amount).toFixed(2)} €</span>
          {Number(row.advance_deducted) > 0 && (
            <span className="text-amber-700">- Avance : {Number(row.advance_deducted).toFixed(2)} €</span>
          )}
          <span className="font-semibold text-foreground">
            À payer : {Number(row.amount_to_pay).toFixed(2)} €
          </span>
          {row.employee.iban && (
            <span className="font-mono text-xs">{row.employee.iban}</span>
          )}
        </div>
      </div>

      <Badge className={statusLabel.className}>{statusLabel.label}</Badge>

      <div className="flex items-center gap-1">
        <QrButton row={row} isLocked={isLocked} />
        <PayButton row={row} isLocked={isLocked} />
        <SendButton row={row} />
      </div>
    </div>
  );
}

function QrButton({ row, isLocked }: { row: PayslipRow; isLocked: boolean }) {
  const [open, setOpen] = useState(false);
  if (!row.qr_png_data_url) {
    return (
      <Button variant="ghost" size="sm" disabled title="QR non disponible (IBAN manquant ?)">
        <QrCode className="w-4 h-4 opacity-30" />
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isLocked} title={isLocked ? "Differée jusqu au " + row.scheduled_payment_date : "Voir QR de paiement"}>
          <QrCode className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Paiement {Number(row.amount_to_pay).toFixed(2)} € → {row.employee.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <img src={row.qr_png_data_url} alt="QR EPC SEPA" className="w-72 h-72" />
          <div className="text-xs text-center text-muted-foreground">
            Scanne avec ton app BNP Paribas → paiement direct.
            <br />
            Communication : <strong>Salaire {row.period_label ?? ""}</strong>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayButton({ row, isLocked }: { row: PayslipRow; isLocked: boolean }) {
  const [pending, startTransition] = useTransition();
  if (row.payment_status === "paid") {
    return (
      <Button variant="ghost" size="sm" disabled title={`Payé le ${row.paid_at ? new Date(row.paid_at).toLocaleDateString("fr-BE") : ""}`}>
        <CheckCircle2 className="w-4 h-4 text-green-600" />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isLocked || pending}
      title="Marquer payé"
      onClick={() => {
        if (!confirm(`Confirmer le paiement de ${Number(row.amount_to_pay).toFixed(2)} € à ${row.employee.full_name} ?`)) return;
        startTransition(async () => {
          const res = await markPayslipPaidAction(row.id);
          if (res.ok) toast.success("Marqué payé");
          else toast.error(res.error ?? "Erreur");
        });
      }}
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
    </Button>
  );
}

function SendButton({ row }: { row: PayslipRow }) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(row.employee.email ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Envoyer la fiche par mail">
          <Mail className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer la fiche de paie</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Destinataire</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="email@example.com" />
            <p className="text-xs text-muted-foreground mt-1">
              Par défaut : email du travailleur. Tu peux mettre celui d un comptable, banque, etc.
            </p>
          </div>
          <Button
            disabled={pending || !recipient}
            onClick={() => {
              startTransition(async () => {
                const res = await sendPayslipToEmployeeAction(row.id, recipient);
                if (res.ok) {
                  toast.success(`Envoyé à ${recipient}`);
                  setOpen(false);
                } else toast.error(res.error ?? "Erreur");
              });
            }}
            className="w-full"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            Envoyer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
