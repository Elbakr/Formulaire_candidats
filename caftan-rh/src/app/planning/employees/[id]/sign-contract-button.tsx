"use client";

// Karim 2026-05-29 : bouton "Envoyer à signer via DocuSeal" sur la fiche
// employee. Choix du type de contrat (CDD plein / CDD partiel / Etudiant)
// + entite (AMD Megastore / Caftan Factory) + confirmation avant envoi.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { sendContractViaDocusealAction } from "./sign-contract-actions";

type Props = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
};

type TemplateCode = "employee" | "employee_pt" | "student";
type OrgKey = "amd_megastore" | "caftan_factory";

const TEMPLATE_LABELS: Record<TemplateCode, string> = {
  employee: "CDD temps plein",
  employee_pt: "CDD temps partiel",
  student: "Contrat étudiant",
};

const ORG_LABELS: Record<OrgKey, string> = {
  amd_megastore: "AMD Megastore SRL",
  caftan_factory: "Caftan Factory",
};

export function SignContractButton({ employeeId, employeeName, employeeEmail }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tplCode, setTplCode] = useState<TemplateCode>("employee");
  const [orgKey, setOrgKey] = useState<OrgKey>("amd_megastore");
  const [employerEmail, setEmployerEmail] = useState<string>("hr@caftanfactory.com");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!employeeEmail) {
      toast.error("Email de l'employé manquant - complète la fiche d'abord.");
      return;
    }
    startTransition(async () => {
      const res = await sendContractViaDocusealAction({
        employeeId,
        templateCode: tplCode,
        orgKey,
        employerEmail,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Contrat envoyé à signer (DocuSeal). ${employeeName} et ${ORG_LABELS[orgKey]} vont recevoir un mail.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Envoie le contrat à signer via DocuSeal">
        <FileSignature className="h-3.5 w-3.5" /> Envoyer à signer
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Envoyer le contrat à signer (DocuSeal)</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Type de contrat</label>
              <div className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-surface p-0.5">
                {(["employee", "employee_pt", "student"] as TemplateCode[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTplCode(k)}
                    className={`px-2 py-1 text-xs font-bold rounded ${tplCode === k ? "bg-gold text-[#1a1a0d]" : "text-ink-3 hover:text-ink-1"}`}
                  >
                    {TEMPLATE_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Entité émettrice</label>
              <div className="inline-flex gap-1 rounded-md border border-line bg-surface p-0.5">
                {(["amd_megastore", "caftan_factory"] as OrgKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOrgKey(k)}
                    className={`px-2 py-1 text-xs font-bold rounded ${orgKey === k ? "bg-gold text-[#1a1a0d]" : "text-ink-3 hover:text-ink-1"}`}
                  >
                    {ORG_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Email signataire employeur</label>
              <input
                type="email"
                value={employerEmail}
                onChange={(e) => setEmployerEmail(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-line bg-surface text-sm"
                placeholder="hr@caftanfactory.com"
              />
              <p className="text-[10px] text-ink-3 mt-1">Reçoit le mail pour signer côté employeur (AMD Megastore représentée par Karim Elbazi).</p>
            </div>
            <div className="border-t border-line pt-3 mt-3 text-[11px] text-ink-2 space-y-1">
              <div><span className="font-bold">Employé :</span> {employeeName}</div>
              <div><span className="font-bold">Email :</span> {employeeEmail || <span className="text-rose-600">manquant</span>}</div>
              <div className="text-amber-700 italic">DocuSeal enverra 2 mails : 1 employeur + 1 employé.</div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={pending || !employeeEmail}>
              {pending ? "Envoi…" : "Envoyer à signer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
