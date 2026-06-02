"use client";

// Karim 2026-06-02 : bouton "Envoi départ" sur /admin/payslips avec
// dropdown de templates RH + preview message + PJ natives (Resend).

import { useState, useTransition, useEffect, useMemo, useRef } from "react";
import { Briefcase, Loader2, Send, Mail, Search, Paperclip, Plus, X as XIcon, Check, FileText } from "lucide-react";
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
import { TEMPLATES, CATEGORY_LABEL, getDefaultTemplateForOffboarding, type TemplateCategory } from "@/lib/message-templates";

interface EmployeeMini { id: string; full_name: string; email: string | null; contract_type: string | null; status: string }
interface PayslipMini { id: string; period_label: string | null; period_year: number; period_month: number; net_amount: number; amount_to_pay: number; payment_status: string }

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function OffboardingButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [employees, setEmployees] = useState<EmployeeMini[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<EmployeeMini | null>(null);
  const [payslips, setPayslips] = useState<PayslipMini[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<string>("");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [overrideEmail, setOverrideEmail] = useState("");
  const [editMode, setEditMode] = useState(false);
  // Karim 2026-06-02 : pieces jointes additionnelles (CV, attestations, etc.)
  const [extraFiles, setExtraFiles] = useState<Array<{ name: string; size: number; type: string; base64: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const r = await listActiveEmployeesAction();
      setEmployees(r as unknown as EmployeeMini[]);
    })();
  }, [open]);

  useEffect(() => {
    if (!selectedEmp) {
      setPayslips([]);
      setSelectedIds(new Set());
      setTemplateId("");
      return;
    }
    (async () => {
      const r = await listPayslipsForEmployeeAction(selectedEmp.id);
      setPayslips(r.payslips);
      setSelectedIds(new Set(r.payslips.slice(0, 2).map((p) => p.id)));
      // Auto-select template selon contract_type
      const def = getDefaultTemplateForOffboarding(selectedEmp.contract_type);
      setTemplateId(def.id);
      setCustomSubject("");
      setCustomBody("");
      setEditMode(false);
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
    setTemplateId("");
    setCustomSubject("");
    setCustomBody("");
    setOverrideEmail("");
    setEditMode(false);
    setExtraFiles([]);
  }

  async function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const added: Array<{ name: string; size: number; type: string; base64: string }> = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} dépasse 10 MB`);
        continue;
      }
      const buf = await f.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      added.push({ name: f.name, size: f.size, type: f.type || "application/octet-stream", base64 });
    }
    setExtraFiles((p) => [...p, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Preview du message rendu par le template selectionne
  const previewRender = useMemo(() => {
    if (!selectedEmp || !templateId) return null;
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return null;
    const periods = payslips
      .filter((p) => selectedIds.has(p.id))
      .map((p) => `• ${MONTH_NAMES[p.period_month - 1]} ${p.period_year}`)
      .join("\n");
    const firstName = selectedEmp.full_name.split(" ")[0] ?? "";
    return tpl.render({
      firstName,
      fullName: selectedEmp.full_name,
      employerName: "Caftan Factory (By AMD Megastore)",
      contractType: selectedEmp.contract_type,
      periodsList: periods,
      currentYear: new Date().getFullYear(),
      hrEmail: "hr@caftanfactory.com",
    });
  }, [templateId, selectedEmp, selectedIds, payslips]);

  function send() {
    if (!selectedEmp) return;
    if (selectedIds.size === 0 && extraFiles.length === 0) {
      toast.error("Coche au moins une fiche OU ajoute une pièce jointe");
      return;
    }
    const dest = (overrideEmail.trim() || selectedEmp.email || "").trim();
    if (!dest) {
      toast.error(`Pas d'email pour ${selectedEmp.full_name}. Utilise "Override email" ci-dessus ou complète sa fiche.`);
      return;
    }
    startTransition(async () => {
      const res = await sendOffboardingPayslipsAction({
        employeeId: selectedEmp.id,
        payslipIds: Array.from(selectedIds),
        templateId: editMode ? undefined : templateId,
        customSubject: editMode ? customSubject : undefined,
        customBody: editMode ? customBody : undefined,
        recipientEmailOverride: overrideEmail.trim() || undefined,
        extraAttachments: extraFiles.map((f) => ({ filename: f.name, contentBase64: f.base64, contentType: f.type })),
      });
      if (res.ok) {
        const providerLabel =
          res.provider === "resend" ? "✓ pièces jointes natives PDF (Resend)" :
          res.provider === "smtp_gmail" ? "✓ pièces jointes natives PDF (Gmail SMTP)" :
          "⚠ liens (configure RESEND_API_KEY ou GMAIL_APP_PASSWORD pour PJ natives)";
        toast.success(`Mail envoyé à ${res.sentTo} — ${providerLabel}`, { duration: 6000 });
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

  // Templates regroupes par categorie pour le dropdown
  const groupedTemplates = useMemo(() => {
    const groups: Record<TemplateCategory, typeof TEMPLATES> = {
      offboarding: [], lifecycle: [], festive: [], admin: [],
    };
    for (const t of TEMPLATES) groups[t.category].push(t);
    return groups;
  }, []);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Briefcase className="h-3.5 w-3.5" /> Envoi avec template
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envoi fiches de paie avec template RH</DialogTitle>
            <DialogDescription>
              Sélectionne l&apos;employé + fiches + template de message. Les fiches sont envoyées en
              <strong> pièces jointes natives</strong> si Resend est configuré, sinon en liens sécurisés (30 jours).
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
                    {e.contract_type && <Badge className="text-[10px] bg-blue-100 text-blue-800">{e.contract_type}</Badge>}
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
                {selectedEmp.contract_type && <div className="text-[11px] mt-0.5">Contrat : <strong>{selectedEmp.contract_type}</strong></div>}
              </div>

              <div>
                <Label>Override email (test)</Label>
                <Input type="email" value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} placeholder={selectedEmp.email ?? "ex: elbazikarim@gmail.com"} />
              </div>

              <div>
                <Label>Fiches à joindre ({selectedIds.size}/{payslips.length})</Label>
                {payslips.length === 0 ? (
                  <div className="text-xs text-ink-3 italic p-3 bg-muted rounded">Aucune fiche.</div>
                ) : (
                  <div className="border border-line rounded divide-y max-h-48 overflow-y-auto">
                    {payslips.map((p) => {
                      const checked = selectedIds.has(p.id);
                      return (
                        <label key={p.id} className={`flex items-center gap-2 p-2 cursor-pointer text-xs ${checked ? "bg-gold/5" : "hover:bg-muted/30"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                          <span className="flex-1"><strong>{MONTH_NAMES[p.period_month - 1]} {p.period_year}</strong></span>
                          <span className="text-ink-3">Net : {Number(p.net_amount).toFixed(2)} €</span>
                          <Badge className={`text-[10px] ${p.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{p.payment_status}</Badge>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label>Template de message</Label>
                <select
                  value={templateId}
                  onChange={(e) => { setTemplateId(e.target.value); setEditMode(false); }}
                  className="w-full border border-line rounded px-2 py-1.5 text-sm bg-surface"
                  disabled={editMode}
                >
                  {Object.entries(groupedTemplates).map(([cat, list]) => (
                    <optgroup key={cat} label={CATEGORY_LABEL[cat as TemplateCategory]}>
                      {list.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {templateId && !editMode && (
                  <div className="text-[10px] text-ink-3 italic mt-1">
                    {TEMPLATES.find((t) => t.id === templateId)?.description}
                  </div>
                )}
              </div>

              {previewRender && !editMode && (
                <details className="border border-line rounded text-xs">
                  <summary className="cursor-pointer p-2 bg-muted/30 font-semibold">
                    Aperçu du message (clique pour ouvrir)
                  </summary>
                  <div className="p-3 space-y-2">
                    <div><strong className="text-[10px] uppercase text-ink-3">Sujet :</strong><br/>{previewRender.subject}</div>
                    <div><strong className="text-[10px] uppercase text-ink-3">Corps :</strong>
                      <pre className="bg-muted/30 p-2 rounded mt-1 whitespace-pre-wrap text-[11px] font-mono">{previewRender.body}</pre>
                    </div>
                    <button onClick={() => {
                      setEditMode(true);
                      setCustomSubject(previewRender.subject);
                      setCustomBody(previewRender.body);
                    }} className="text-[11px] text-blue-700 underline">
                      Personnaliser ce message
                    </button>
                  </div>
                </details>
              )}

              {editMode && (
                <div className="space-y-2 border border-amber-200 bg-amber-50/50 rounded p-2">
                  <div className="text-[10px] uppercase text-amber-700 font-bold">Mode personnalisé</div>
                  <div>
                    <Label>Sujet</Label>
                    <Input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
                  </div>
                  <div>
                    <Label>Corps</Label>
                    <Textarea rows={14} value={customBody} onChange={(e) => setCustomBody(e.target.value)} className="font-mono text-[11px]" />
                  </div>
                  <button onClick={() => setEditMode(false)} className="text-[11px] text-blue-700 underline">
                    Revenir au template
                  </button>
                </div>
              )}

              {/* Karim 2026-06-02 : section PJ clarifiee — montre EXACTEMENT
                  les PJ qui seront jointes (fiches cochees + extra) avec ✓ vert
                  et permet d'uploader des fichiers additionnels. */}
              <div className="border border-green-300 bg-green-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-green-900">
                  <Paperclip className="w-3.5 h-3.5" />
                  Pièces jointes prêtes à envoyer ({selectedIds.size + extraFiles.length})
                </div>

                {selectedIds.size > 0 && (
                  <div className="space-y-1 ml-5">
                    {Array.from(selectedIds).map((id) => {
                      const p = payslips.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <div key={id} className="flex items-center gap-2 text-[11px] text-green-900">
                          <Check className="w-3 h-3 text-green-600" />
                          <FileText className="w-3 h-3" />
                          <span>Fiche de paie — {MONTH_NAMES[p.period_month - 1]} {p.period_year} (PDF watermarké automatiquement)</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 ml-5 text-[11px] text-green-900">
                    <Check className="w-3 h-3 text-green-600" />
                    <FileText className="w-3 h-3" />
                    <span className="flex-1 truncate">{f.name} <span className="text-ink-3">({(f.size / 1024).toFixed(0)} kB)</span></span>
                    <button
                      type="button"
                      onClick={() => setExtraFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="text-red-600 hover:text-red-800"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {selectedIds.size === 0 && extraFiles.length === 0 && (
                  <div className="text-[11px] text-ink-3 italic ml-5">Aucune pièce jointe pour l'instant.</div>
                )}

                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-green-200">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,image/*,.doc,.docx,.txt"
                    onChange={(e) => handleAddFiles(e.target.files)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-green-900 hover:text-green-700 underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter d&apos;autres fichiers (certificat de travail, C4, attestation, etc.)
                  </button>
                  <span className="text-[10px] text-ink-3">Max 10 MB/fichier</span>
                </div>

                <div className="text-[10px] text-ink-3 italic mt-1">
                  📨 Mode envoi : {process.env.NEXT_PUBLIC_HAS_RESEND === "1" ? "pièces jointes natives (Resend)" : "à confirmer après envoi (PJ natives si Resend configuré, sinon liens 30j)"}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="gold" onClick={send} disabled={pending || !selectedEmp || selectedIds.size === 0}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Envoyer {selectedIds.size > 0 ? `(${selectedIds.size} PJ)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
