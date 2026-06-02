"use client";

// Karim 2026-06-02 : bouton "Envoi départ" sur /admin/payslips.
// Permet d'envoyer plusieurs fiches de paie en bloc à un employee en fin
// de contrat avec un message PME pro + remerciements.

import { useState, useTransition, useEffect } from "react";
import { Briefcase, Loader2, Send, Mail, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  sendOffboardingPayslipsAction,
  listPayslipsForEmployeeAction,
  listActiveEmployeesAction,
} from "./actions";

interface EmployeeMini { id: string; full_name: string; email: string | null; contract_type: string | null; status: string }

interface PayslipMini {
  id: string;
  period_label: string | null;
  period_year: number;
  period_month: number;
  net_amount: number;
  amount_to_pay: number;
  payment_status: string;
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function OffboardingButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [employees, setEmployees] = useState<EmployeeMini[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<EmployeeMini | null>(null);
  const [payslips, setPayslips] = useState<PayslipMini[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customMessage, setCustomMessage] = useState("");
  const [overrideEmail, setOverrideEmail] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const r = await listActiveEmployeesAction();
      // Filtre status = on_leave + active. Pour ex-travailleurs : on charge tous les status
      // listActiveEmployeesAction renvoie deja active + on_leave. On garde tel quel
      // mais le user peut taper a la main si besoin.
      setEmployees(r as unknown as EmployeeMini[]);
    })();
  }, [open]);

  useEffect(() => {
    if (!selectedEmp) {
      setPayslips([]);
      setSelectedIds(new Set());
      return;
    }
    (async () => {
      const r = await listPayslipsForEmployeeAction(selectedEmp.id);
      setPayslips(r.payslips);
      // Pre-coche les fiches les plus récentes (max 2)
      setSelectedIds(new Set(r.payslips.slice(0, 2).map((p) => p.id)));
    })();
  }, [selectedEmp]);

  function toggle(id: string) {
    setSelectedIds((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function reset() {
    setSelectedEmp(null);
    setSearch("");
    setSelectedIds(new Set());
    setCustomMessage("");
    setOverrideEmail("");
    setPreview(false);
  }

  function send() {
    if (!selectedEmp || selectedIds.size === 0) return;
    const dest = overrideEmail.trim() || selectedEmp.email;
    if (!dest) {
      toast.error("Pas d'email destinataire - complète la fiche employee");
      return;
    }
    startTransition(async () => {
      const res = await sendOffboardingPayslipsAction({
        employeeId: selectedEmp.id,
        payslipIds: Array.from(selectedIds),
        customMessage: customMessage.trim() || undefined,
        recipientEmailOverride: overrideEmail.trim() || undefined,
      });
      if (res.ok) {
        toast.success(`✓ ${selectedIds.size} fiche(s) envoyée(s) à ${res.sentTo}`);
        reset();
        setOpen(false);
      } else {
        toast.error(res.error ?? "Envoi KO");
      }
    });
  }

  const filtered = employees.filter((e) =>
    !search.trim() || e.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  const isStudent = selectedEmp?.contract_type === "Étudiant" || selectedEmp?.contract_type === "Student";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Briefcase className="h-3.5 w-3.5" /> Envoi départ
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envoi fiches de paie — Fin de contrat</DialogTitle>
            <DialogDescription>
              Sélectionne l&apos;employé et ses dernières fiches. Un mail unique avec message PME
              professionnel de remerciement sera envoyé. {isStudent ? "(Étudiant : 1 fiche habituellement)" : "(Non-étudiant : 2 fiches habituellement — salaire final + pécule/13e mois prorata)"}
            </DialogDescription>
          </DialogHeader>

          {!selectedEmp ? (
            <div className="space-y-2 py-2">
              <Label>Rechercher l&apos;employé</Label>
              <div className="flex items-center gap-2 border border-line rounded px-2 py-1 bg-surface">
                <Search className="w-4 h-4 text-ink-3" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tape un nom..."
                  className="flex-1 bg-transparent outline-none text-sm"
                  autoFocus
                />
              </div>
              <div className="max-h-72 overflow-y-auto border border-line rounded divide-y">
                {filtered.length === 0 && <div className="p-3 text-xs text-ink-3">Aucun employé.</div>}
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmp(e)}
                    className="w-full text-left p-2 hover:bg-muted/40 text-xs flex items-center gap-2"
                  >
                    <span className="flex-1">{e.full_name}</span>
                    {e.contract_type && (
                      <Badge className="text-[10px] bg-blue-100 text-blue-800">{e.contract_type}</Badge>
                    )}
                    <span className="text-[10px] text-ink-3">{e.email ?? "no mail"}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <strong className="text-sm">{selectedEmp.full_name}</strong>
                  <button onClick={() => setSelectedEmp(null)} className="text-[10px] text-blue-700 underline">Changer</button>
                </div>
                <div className="text-[11px] text-ink-2">
                  <Mail className="w-3 h-3 inline" /> <span className="font-mono">{selectedEmp.email ?? "⚠ pas d'email"}</span>
                </div>
                {selectedEmp.contract_type && (
                  <div className="text-[11px] mt-0.5">
                    Contrat : <strong>{selectedEmp.contract_type}</strong>
                  </div>
                )}
              </div>

              <div>
                <Label>Override email (optionnel - vers ton compte pour test)</Label>
                <Input
                  type="email"
                  value={overrideEmail}
                  onChange={(e) => setOverrideEmail(e.target.value)}
                  placeholder={selectedEmp.email ?? "ex: elbazikarim@gmail.com"}
                />
              </div>

              <div>
                <Label>Fiches de paie à inclure ({selectedIds.size}/{payslips.length})</Label>
                {payslips.length === 0 ? (
                  <div className="text-xs text-ink-3 italic p-3 bg-muted rounded">Aucune fiche de paie pour cet employé.</div>
                ) : (
                  <div className="border border-line rounded divide-y max-h-60 overflow-y-auto">
                    {payslips.map((p) => {
                      const checked = selectedIds.has(p.id);
                      return (
                        <label key={p.id} className={`flex items-center gap-2 p-2 cursor-pointer text-xs ${checked ? "bg-gold/5" : "hover:bg-muted/30"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                          <span className="flex-1">
                            <strong>{MONTH_NAMES[p.period_month - 1]} {p.period_year}</strong>
                            {p.period_label && <span className="ml-1 text-ink-3">({p.period_label})</span>}
                          </span>
                          <span className="text-ink-3">Net : {Number(p.net_amount).toFixed(2)} €</span>
                          <Badge className={`text-[10px] ${p.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                            {p.payment_status}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label>
                  <button type="button" onClick={() => setPreview(!preview)} className="text-blue-700 underline text-xs">
                    {preview ? "Masquer" : "Voir/Éditer"} le message
                  </button>
                </Label>
                {preview && (
                  <Textarea
                    rows={14}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="(Vide = message PME pro par défaut — adapté étudiant/non-étudiant)"
                    className="font-mono text-[11px]"
                  />
                )}
                {!preview && (
                  <div className="text-[11px] text-ink-3 italic">
                    Message PME pro par défaut sera utilisé ({isStudent ? "version étudiant" : "version non-étudiant"}). Clique pour personnaliser.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              variant="gold"
              onClick={send}
              disabled={pending || !selectedEmp || selectedIds.size === 0}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Envoyer {selectedIds.size > 0 ? `(${selectedIds.size} fiches)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
