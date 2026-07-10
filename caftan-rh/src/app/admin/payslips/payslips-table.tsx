"use client";

import { useState, useTransition, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, CheckCircle2, Mail, AlertCircle, Calendar, Loader2, Link2, Edit3, FileText, Wallet, Hourglass, Trash2 } from "lucide-react";
import {
  markPayslipPaidAction,
  sendPayslipToEmployeeAction,
  reassignPayslipAction,
  updatePayslipAmountAction,
  listActiveEmployeesAction,
  getPayslipPdfUrlAction,
  setAdvanceAndRecomputeAction,
  markPayslipsPaidBulkAction,
  sendPayslipsToEmployeesBulkAction,
  deletePayslipAction,
} from "./actions";
import { toast } from "sonner";

// Karim 2026-05-31 : contexte pour partage selection bulk entre table et rows
const BulkContext = createContext<{
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
} | null>(null);

export interface PayslipRow {
  id: string;
  employee_id: string | null;
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
  hrconsult_doc_ref: string | null;
  // Karim 2026-05-31 : enrichi cote server depuis site primaire
  employee_city?: "Bruxelles" | "Anvers" | null;
  employee: {
    id: string;
    full_name: string;
    email: string | null;
    iban: string | null;
    preferred_language: string | null;
  } | null;
}

const MONTH_NAMES_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export function PayslipsTable({ rows }: { rows: PayslipRow[] }) {
  const router = useRouter();
  // Karim 2026-05-31 : bulk - state + helpers
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();

  const toggleId = (id: string) =>
    setSelected((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const isSelected = (id: string) => selected.has(id);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + Number(r.amount_to_pay ?? 0), 0);
  const selectedPayable = selectedRows.filter(
    (r) => r.payment_status === "pending" || r.payment_status === "scheduled",
  ).length;

  function selectAllVisible(checked: boolean) {
    setSelected((p) => {
      const s = new Set(p);
      for (const r of rows) {
        if (checked) s.add(r.id);
        else s.delete(r.id);
      }
      return s;
    });
  }

  async function bulkMarkPaid() {
    if (selected.size === 0) return;
    if (!confirm(`Marquer ${selected.size} fiche(s) payée(s) (total : ${selectedTotal.toFixed(2)} €) ?`)) return;
    startBulk(async () => {
      const res = await markPayslipsPaidBulkAction(Array.from(selected));
      if (res.ok) {
        toast.success(`${res.updated} fiche(s) marquée(s) payée(s)`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Erreur");
    });
  }

  async function bulkSend() {
    if (selected.size === 0) return;
    if (!confirm(`Envoyer ${selected.size} fiche(s) par mail aux employés concernés ?`)) return;
    startBulk(async () => {
      const res = await sendPayslipsToEmployeesBulkAction(Array.from(selected));
      if (res.ok) {
        toast.success(`${res.sent} envoyée(s)${res.skipped ? `, ${res.skipped} échec(s)` : ""}`);
        if (res.errors && res.errors.length > 0) console.warn("Bulk send errors:", res.errors);
        setSelected(new Set());
        router.refresh();
      } else toast.error("Erreur envoi");
    });
  }

  // Group by year+month
  const groups = new Map<string, PayslipRow[]>();
  for (const r of rows) {
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const groupKeys = Array.from(groups.keys()).sort().reverse();

  return (
    <BulkContext.Provider value={{ selected, toggle: toggleId, isSelected }}>
      <div className="space-y-4">
        {/* Karim 2026-05-31 : barre actions bulk floating */}
        {selected.size > 0 && (
          <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] sm:bottom-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background rounded-full shadow-2xl px-5 py-3 flex items-center gap-4 text-sm max-w-[calc(100vw-1rem)] overflow-x-auto">
            <span className="font-bold">
              {selected.size} fiche{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
            </span>
            <span className="text-xs opacity-80">Total : {selectedTotal.toFixed(2)} €</span>
            <button
              type="button"
              onClick={bulkMarkPaid}
              disabled={bulkPending || selectedPayable === 0}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
            >
              {bulkPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Marquer payées
            </button>
            <button
              type="button"
              onClick={bulkSend}
              disabled={bulkPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"
            >
              {bulkPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Envoyer
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs opacity-70 hover:opacity-100 ml-2"
            >
              Annuler
            </button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                onChange={(e) => selectAllVisible(e.target.checked)}
              />
              Sélectionner tout ({rows.length})
            </label>
          </div>
        )}

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
    </BulkContext.Provider>
  );
}

function PayslipRowCard({ row }: { row: PayslipRow }) {
  const todayLeq = row.scheduled_payment_date
    ? new Date(row.scheduled_payment_date).getTime() <= Date.now()
    : true;
  const isLocked = row.is_secondary && !todayLeq;
  const isOrphan = !row.employee;
  const statusLabel = {
    pending: { label: "En attente", className: "bg-blue-100 text-blue-800" },
    scheduled: { label: `Différée → ${row.scheduled_payment_date ?? ""}`, className: "bg-amber-100 text-amber-800" },
    paid: { label: "Payée", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-800" },
  }[row.payment_status];

  // Karim 2026-05-30 : style distinct pour les fiches a venir (scheduled future)
  const isUpcoming = row.payment_status === "scheduled" && isLocked;
  const rowBg = isOrphan
    ? "bg-amber-50/50"
    : isUpcoming
    ? "bg-purple-50/60 opacity-70"
    : "";
  const bulk = useContext(BulkContext);
  const checked = bulk?.isSelected(row.id) ?? false;
  return (
    <div className={`p-4 flex flex-wrap items-center gap-2 hover:bg-muted/20 ${rowBg} ${checked ? "bg-blue-50/60" : ""}`}>
      {bulk && (
        <input
          type="checkbox"
          checked={checked}
          onChange={() => bulk.toggle(row.id)}
          className="flex-shrink-0"
          aria-label="Sélectionner cette fiche"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isUpcoming && (
            <Hourglass className="w-4 h-4 text-purple-600 flex-shrink-0" />
          )}
          {isOrphan ? (
            <>
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="font-medium truncate text-amber-900">
                Non associée
                {row.hrconsult_doc_ref && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({row.hrconsult_doc_ref})
                  </span>
                )}
              </span>
            </>
          ) : (
            <span className="font-medium truncate">{row.employee!.full_name}</span>
          )}
          {row.is_secondary && (
            <Badge variant="muted" className="text-xs" title="2e fiche du mois — l'avance ne s'y déduit jamais (elle est consommée par la fiche principale)">
              <Calendar className="w-3 h-3 mr-1" />
              Secondaire · avance N/A
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
          {row.employee?.iban && (
            <span className="font-mono text-xs">{row.employee!.iban}</span>
          )}
        </div>
      </div>

      <Badge className={`${statusLabel.className} shrink-0`}>{statusLabel.label}</Badge>

      <div className="flex items-center gap-1 flex-wrap justify-end ml-auto">
        {!isOrphan && !row.is_secondary && <AdvanceInlineInput key={row.advance_deducted} row={row} />}
        <ViewPdfButton row={row} />
        <EditAmountButton row={row} />
        <AssignButton row={row} />
        <QrButton row={row} isLocked={isLocked} />
        <PayButton row={row} isLocked={isLocked} />
        <SendButton row={row} />
        <DeleteButton row={row} />
      </div>
    </div>
  );
}

// Karim 2026-07-02 : supprimer un import erroné / doublon / orpheline.
// Interdit sur une fiche PAYÉE (audit paie). Purge aussi la sélection bulk.
function DeleteButton({ row }: { row: PayslipRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const bulk = useContext(BulkContext);
  const isPaid = row.payment_status === "paid";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || isPaid}
      title={isPaid ? "Fiche payée : suppression interdite (audit paie)" : "Supprimer cette fiche"}
      onClick={() => {
        if (isPaid) return;
        const who = row.employee?.full_name ?? "Non associée";
        const ok = window.confirm(
          `Supprimer la fiche de ${who} (${row.period_label ?? `${row.period_month}/${row.period_year}`}) ` +
            `— ${Number(row.amount_to_pay).toFixed(2)} € ?\n\nAction irréversible.`,
        );
        if (!ok) return;
        startTransition(async () => {
          const res = await deletePayslipAction(row.id);
          if (res.ok) {
            toast.success("Fiche supprimée");
            if (bulk?.isSelected(row.id)) bulk.toggle(row.id); // retire l'id supprimé de la sélection
            router.refresh();
          } else toast.error(res.error ?? "Erreur suppression");
        });
      }}
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className={`w-4 h-4 ${isPaid ? "text-ink-3" : "text-red-600"}`} />}
    </Button>
  );
}

function ViewPdfButton({ row }: { row: PayslipRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      title="Voir / Télécharger le PDF"
      disabled={pending}
      onClick={() => {
        // Karim 2026-06-15 : window.open APRÈS un await est BLOQUÉ sur mobile/PWA
        // iOS (le geste utilisateur est consommé par l'attente) -> le bouton ne
        // réagissait pas. On ouvre l'onglet SYNCHRONEMENT (préserve le geste), puis
        // on y pose l'URL une fois récupérée ; repli sur navigation directe si bloqué.
        const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
        startTransition(async () => {
          const res = await getPayslipPdfUrlAction(row.id);
          if (res.ok && res.url) {
            if (win && !win.closed) win.location.href = res.url;
            else window.location.href = res.url;
          } else {
            if (win && !win.closed) win.close();
            toast.error(res.error ?? "PDF indisponible");
          }
        });
      }}
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
    </Button>
  );
}

function AdvanceInlineInput({ row }: { row: PayslipRow }) {
  const router = useRouter();
  const [value, setValue] = useState(String(row.advance_deducted ?? 0));
  const [pending, startTransition] = useTransition();
  const initial = String(row.advance_deducted ?? 0);
  const dirty = value !== initial;
  return (
    <div className="flex items-center gap-1" title="Avance déduite (Enter pour sauver + regénérer QR)">
      <Wallet className="w-3.5 h-3.5 text-amber-600" />
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!dirty) return;
          const n = parseFloat(value.replace(",", "."));
          if (!Number.isFinite(n) || n < 0) {
            setValue(initial);
            toast.error("Montant invalide");
            return;
          }
          startTransition(async () => {
            const res = await setAdvanceAndRecomputeAction(row.id, n);
            if (res.ok) {
              toast.success(
                res.qr === "generated"
                  ? `Avance ${n.toFixed(2)} € enregistrée — net restant + QR régénérés`
                  : `Avance ${n.toFixed(2)} € enregistrée — net restant recalculé (pas de QR : à payer 0 ou IBAN manquant)`,
              );
              router.refresh();
            } else toast.error(res.error ?? "Erreur");
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        className={`w-20 text-xs px-1.5 py-0.5 border rounded ${dirty ? "border-amber-500 bg-amber-50" : "border-transparent"}`}
        placeholder="0.00"
        disabled={pending}
      />
      {pending && <Loader2 className="w-3 h-3 animate-spin" />}
    </div>
  );
}

function AssignButton({ row }: { row: PayslipRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string; iban: string | null; status: string }>>([]);
  const [selected, setSelected] = useState(row.employee_id ?? "");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  function loadEmployees() {
    if (employees.length > 0) return;
    listActiveEmployeesAction().then(setEmployees);
  }

  const filtered = search
    ? employees.filter((e) => e.full_name.toLowerCase().includes(search.toLowerCase()))
    : employees;
  const activeCount = employees.filter((e) => e.status === "active").length;
  const onLeaveCount = employees.filter((e) => e.status === "on_leave").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadEmployees(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title={row.employee ? "Re-affecter" : "Associer à un employé"}>
          <Link2 className={`w-4 h-4 ${!row.employee ? "text-amber-600" : ""}`} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.employee ? "Re-affecter la fiche" : "Associer la fiche à un employé"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Chercher..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          {employees.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {activeCount} actifs · {onLeaveCount} en congé · {employees.length} au total
            </div>
          )}
          <div className="max-h-72 overflow-y-auto border rounded">
            {filtered.map((e) => (
              <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-muted/30 cursor-pointer">
                <input type="radio" name="emp" value={e.id} checked={selected === e.id} onChange={() => setSelected(e.id)} />
                <span className="text-sm">{e.full_name}</span>
                {e.status === "on_leave" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">en congé</span>
                )}
                {e.iban && <span className="text-xs text-muted-foreground font-mono ml-auto">{e.iban}</span>}
              </label>
            ))}
            {filtered.length === 0 && <div className="p-3 text-xs text-muted-foreground">Aucun employé</div>}
          </div>
          <Button
            disabled={!selected || pending}
            className="w-full"
            onClick={() => {
              startTransition(async () => {
                const res = await reassignPayslipAction(row.id, selected);
                if (res.ok) {
                  toast.success("Fiche associée — net restant + QR recalculés");
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error ?? "Erreur");
              });
            }}
          >
            {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
            Associer + générer QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAmountButton({ row }: { row: PayslipRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(row.net_amount));
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Modifier le montant net">
          <Edit3 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le montant net</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs">Net (€) — sera reduit de l avance puis le QR sera regenere</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button
            disabled={pending}
            className="w-full"
            onClick={() => {
              const n = parseFloat(amount.replace(",", "."));
              if (!Number.isFinite(n) || n < 0) {
                toast.error("Montant invalide");
                return;
              }
              startTransition(async () => {
                const res = await updatePayslipAmountAction(row.id, n);
                if (res.ok) {
                  toast.success("Montant mis à jour — net restant + QR recalculés");
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error ?? "Erreur");
              });
            }}
          >
            {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit3 className="w-4 h-4 mr-2" />}
            Enregistrer + regénérer QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QrButton({ row, isLocked }: { row: PayslipRow; isLocked: boolean }) {
  const [open, setOpen] = useState(false);
  if (row.payment_status === "paid") {
    return (
      <Button variant="ghost" size="sm" disabled title="Fiche payée — QR retiré (anti double paiement)">
        <QrCode className="w-4 h-4 opacity-30" />
      </Button>
    );
  }
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
            Paiement {Number(row.amount_to_pay).toFixed(2)} € → {row.employee?.full_name ?? "(non associée)"}
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (row.payment_status === "paid") {
    return (
      <Button variant="ghost" size="sm" disabled title={`Payé le ${row.paid_at ? new Date(row.paid_at).toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" }) : ""}`}>
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
        if (!confirm(`Confirmer le paiement de ${Number(row.amount_to_pay).toFixed(2)} € à ${row.employee?.full_name ?? "(non associée)"} ?`)) return;
        startTransition(async () => {
          const res = await markPayslipPaidAction(row.id);
          if (res.ok) {
            toast.success("Marqué payé");
            router.refresh();
          } else toast.error(res.error ?? "Erreur");
        });
      }}
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
    </Button>
  );
}

function SendButton({ row }: { row: PayslipRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(row.employee?.email ?? "");
  // Karim 2026-07-10 : par défaut PIÈCE JOINTE PDF. Case discrète pour envoyer via lien.
  const [sendViaLink, setSendViaLink] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = !row.employee;
  return (
    <Dialog open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} title={disabled ? "Associe d'abord à un employé" : "Envoyer la fiche par mail"}>
          <Mail className={`w-4 h-4 ${disabled ? "opacity-30" : ""}`} />
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
          {/* Karim 2026-07-10 : par défaut la fiche part en PIÈCE JOINTE PDF.
              Case discrète pour basculer sur un lien signé. */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={sendViaLink} onChange={(e) => setSendViaLink(e.target.checked)} />
            <span>Envoyer via lien (au lieu de pièce jointe) — <span className="opacity-70">Verzenden via link i.p.v. bijlage</span></span>
          </label>
          <Button
            disabled={pending || !recipient}
            onClick={() => {
              startTransition(async () => {
                const res = await sendPayslipToEmployeeAction(row.id, recipient, sendViaLink ? "link" : "attachment");
                if (res.ok) {
                  toast.success(`Envoyé à ${recipient} — ${sendViaLink ? "lien sécurisé" : "pièce jointe PDF"}`);
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error ?? "Erreur");
              });
            }}
            className="w-full"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            Envoyer {sendViaLink ? "(lien)" : "(PDF joint)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
