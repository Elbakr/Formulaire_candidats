"use client";

// Karim 2026-05-29 : bouton "Envoyer à signer via DocuSeal" sur la fiche
// employee. Choix du type de contrat (CDD plein / CDD partiel / Etudiant)
// + entite (AMD Megastore / Caftan Factory) + confirmation avant envoi.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, AlertTriangle, Mail, CheckCircle2, Eye } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
import { sendInfoRequestMailAction } from "./info-request-actions";
import { getMissingFields, type MissingField } from "@/lib/contract-readiness";

type Props = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  // Karim 2026-05-30 : type de contrat auto-affecte depuis la fiche employee
  contractType: string | null;
  workTimeKind: string | null;
  weeklyHours: number | null;
  // Karim 2026-05-30 : full employee record pour calculer champs manquants
  employeeRecord: Record<string, unknown>;
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

// Karim 2026-05-30 : template par defaut du mail envoye au candidat.
// Variables auto-remplacees cote serveur lors de l envoi.
const DEFAULT_MAIL_BODY = `Bonjour {first_name},

Nous vous souhaitons la bienvenue dans l'équipe {employer_name} !

Votre contrat de travail est prêt et a déjà été signé par notre direction. Il ne vous reste plus qu'à le signer électroniquement en cliquant sur le lien sécurisé ci-dessous :

👉 {signing_url}

Une fois signé, vous recevrez automatiquement une copie complète du contrat par mail.

Si vous avez la moindre question, répondez simplement à ce mail.

Bien à vous,
L'équipe RH de {employer_name}`;

/**
 * Karim 2026-05-30 : derive le template DocuSeal a partir de la fiche employee.
 * Toute modification du type passe par la fiche employee (single source of truth).
 */
function deriveTemplateCode(
  contractType: string | null,
  workTimeKind: string | null,
  weeklyHours: number | null,
): TemplateCode {
  if (contractType === "Étudiant" || contractType === "Etudiant") return "student";
  // CDD : si work_time_kind explicite, l utiliser ; sinon deriver des heures
  if (workTimeKind === "full") return "employee";
  if (workTimeKind === "partial" || workTimeKind === "part") return "employee_pt";
  // Derive : >= 30h -> plein, sinon partiel
  return (weeklyHours ?? 38) >= 30 ? "employee" : "employee_pt";
}

export function SignContractButton({
  employeeId,
  employeeName,
  employeeEmail,
  contractType,
  workTimeKind,
  weeklyHours,
  employeeRecord,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [infoRequestOpen, setInfoRequestOpen] = useState(false);
  const tplCode = deriveTemplateCode(contractType, workTimeKind, weeklyHours);
  const [orgKey, setOrgKey] = useState<OrgKey>("amd_megastore");
  const [employerEmail, setEmployerEmail] = useState<string>("hr@caftanfactory.com");
  const [mailBody, setMailBody] = useState<string>(DEFAULT_MAIL_BODY);
  const [pending, startTransition] = useTransition();
  // Karim 2026-05-30 : calcul des champs manquants - separe admin vs candidate
  const missing: MissingField[] = getMissingFields(employeeRecord, contractType);
  const isReady = missing.length === 0;
  const missingCandidate = missing.filter((m) => !m.adminOnly);
  const missingAdmin = missing.filter((m) => m.adminOnly);

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
        customMailBody: mailBody !== DEFAULT_MAIL_BODY ? mailBody : undefined,
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
      {isReady ? (
        <Button
          variant="default"
          size="sm"
          onClick={() => setOpen(true)}
          title="Tous les champs requis sont remplis - prêt à envoyer"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Envoyer à signer
        </Button>
      ) : missingCandidate.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInfoRequestOpen(true)}
          title={`${missingCandidate.length} champ(s) à demander au candidat`}
          className="border-amber-400 text-amber-700 hover:bg-amber-50"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Demander {missingCandidate.length} info{missingCandidate.length > 1 ? "s" : ""} au candidat
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled
          title={`Champs admin/RH manquants : ${missingAdmin.map(m => m.label).join(", ")}. À compléter sur la fiche.`}
          className="border-red-400 text-red-700 bg-red-50 cursor-not-allowed"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Compléter {missingAdmin.length} info{missingAdmin.length > 1 ? "s" : ""} admin sur la fiche
        </Button>
      )}
      {/* Dialog "infos manquantes" */}
      <InfoRequestDialog
        open={infoRequestOpen}
        onOpenChange={setInfoRequestOpen}
        employeeId={employeeId}
        employeeName={employeeName}
        employeeEmail={employeeEmail}
        missing={missing}
      />
      {/* Original dialog envoi DocuSeal (uniquement si isReady) */}
      <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Envoyer le contrat à signer (DocuSeal)</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {/* Karim 2026-05-30 : bouton APERÇU contrat (ouvre nouvelle fenêtre iframe) */}
              <a
                href={`/planning/employees/${employeeId}/contract-preview?tpl=${tplCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-semibold"
              >
                <Eye className="w-3.5 h-3.5" />
                Aperçu (envoi numérique)
              </a>
              {/* Karim 2026-05-31 : version imprimable sans pre-signature pour signature manuelle */}
              <a
                href={`/planning/employees/${employeeId}/contract-print?tpl=${tplCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-gray-300 text-gray-700 bg-gray-50 hover:bg-gray-100 text-xs font-semibold"
              >
                🖨️ Imprimer (signature manuelle)
              </a>
            </div>
            {/* Karim 2026-05-30 : type de contrat read-only, herite de la fiche employee */}
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Type de contrat</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-line bg-muted/40">
                <span className="text-sm font-semibold">{TEMPLATE_LABELS[tplCode]}</span>
                <span className="ml-auto text-[10px] text-ink-3 italic">défini sur la fiche employé</span>
              </div>
              <p className="text-[10px] text-ink-3 mt-1">
                Pour changer le type, modifie le contrat et les heures sur la fiche employé.
              </p>
              {/* Karim 2026-05-30 : debug visuel - aide a comprendre la derivation */}
              <details className="mt-1">
                <summary className="text-[9px] text-ink-3 cursor-pointer">Détails du calcul (debug)</summary>
                <div className="text-[10px] bg-muted/30 p-2 rounded mt-1 font-mono leading-relaxed">
                  contract_type = <strong>{contractType ?? "null"}</strong><br />
                  work_time_kind = <strong>{workTimeKind ?? "null"}</strong><br />
                  weekly_hours = <strong>{weeklyHours ?? "null"}</strong><br />
                  → template = <strong>{tplCode}</strong>
                </div>
                <p className="text-[10px] text-amber-700 mt-1">
                  Ces valeurs viennent de la BD. Si tu as modifié le contrat sans cliquer
                  Enregistrer en bas de la fiche, ferme cette fenêtre, sauvegarde, et ré-ouvre.
                </p>
              </details>
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
              <p className="text-[10px] text-ink-3 mt-1">Reçoit une copie du contrat pour archive (sécurité légale employeur).</p>
            </div>
            {/* Karim 2026-05-30 : EDITION du corps du mail envoyé au candidat */}
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">
                Corps du mail au candidat (modifiable)
              </label>
              <Textarea
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
                rows={8}
                className="text-xs font-mono"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-ink-3">
                  Variables disponibles : {`{first_name}, {employer_name}, {signing_url}`} (auto-remplacees)
                </p>
                <button
                  type="button"
                  onClick={() => setMailBody(DEFAULT_MAIL_BODY)}
                  className="text-[10px] text-blue-700 hover:underline"
                >
                  ↺ Restaurer template
                </button>
              </div>
            </div>
            <div className="border-t border-line pt-3 mt-3 text-[11px] text-ink-2 space-y-1">
              <div><span className="font-bold">Employé :</span> {employeeName}</div>
              <div><span className="font-bold">Email :</span> {employeeEmail || <span className="text-rose-600">manquant</span>}</div>
              <div className="text-blue-700 italic">📧 2 envois : 1 mail signature au candidat + 1 copie archive à {employerEmail}.</div>
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

function InfoRequestDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  employeeEmail,
  missing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  missing: MissingField[];
}) {
  const [pending, startTransition] = useTransition();
  // Groupé par pageSection
  const grouped = new Map<string, MissingField[]>();
  for (const m of missing) {
    const sec = m.pageSection ?? "Autres";
    if (!grouped.has(sec)) grouped.set(sec, []);
    grouped.get(sec)!.push(m);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{missing.length} champ(s) manquant(s) pour générer le contrat</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-ink-2">
            Avant d&apos;envoyer le contrat à signer à <strong>{employeeName}</strong>,
            il faut compléter les champs suivants sur sa fiche RH :
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {Array.from(grouped.entries()).map(([sec, items]) => (
              <div key={sec} className="border border-amber-200 bg-amber-50 rounded p-2">
                <div className="text-[11px] font-bold text-amber-900 mb-1">{sec}</div>
                <ul className="text-xs text-ink-2 space-y-0.5">
                  {items.map((m) => (
                    <li key={m.key} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      {m.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-3 text-[11px] text-ink-2">
            <p>
              <strong>Mail au candidat :</strong> contient un magic link auto-login (1h)
              + liens self-service pour compléter sa fiche.
            </p>
            <p className="mt-1">Destinataire : <strong>{employeeEmail || <span className="text-rose-600">email manquant</span>}</strong></p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Annuler</Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !employeeEmail}
            onClick={() => {
              startTransition(async () => {
                const res = await sendInfoRequestMailAction(employeeId);
                if (res.error) { toast.error(res.error); return; }
                toast.success(`Mail envoyé à ${res.sent_to}`);
                onOpenChange(false);
              });
            }}
          >
            <Mail className="h-3.5 w-3.5 mr-1" />
            {pending ? "Envoi…" : "Envoyer le mail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
