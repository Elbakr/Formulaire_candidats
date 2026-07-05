"use client";

// Karim 2026-05-29 : bouton "Envoyer à signer via DocuSeal" sur la fiche
// employee. Choix du type de contrat (CDD plein / CDD partiel / Etudiant)
// + entite (AMD Megastore / Caftan Factory) + confirmation avant envoi.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, AlertTriangle, Mail, CheckCircle2, Eye, Clock, Download } from "lucide-react";
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
import { sendContractForSignatureAction } from "./sign-contract-actions";
import { sendInfoRequestMailAction } from "./info-request-actions";
import { getMissingFields, type MissingField } from "@/lib/contract-readiness";
import { saveContractTermsAction } from "./contract-terms-actions";

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
  // Karim 2026-06-03 : etat dernier contrat envoye -> 3 etats UI
  latestContract: {
    id: string;
    docusealStatus: "pending" | "sent" | "opened" | "completed" | "declined" | null;
    signedAt: string | null;
    signedPdfUrl: string | null;
  } | null;
  // Karim 2026-06-18 : entité par défaut = celle du SITE du travailleur (éditable).
  defaultOrgKey?: OrgKey;
};

type TemplateCode = "employee" | "employee_pt" | "student";
type OrgKey = "amd_megastore" | "caftan_factory" | "homix";

const TEMPLATE_LABELS: Record<TemplateCode, string> = {
  employee: "CDD temps plein",
  employee_pt: "CDD temps partiel",
  student: "Contrat étudiant",
};

const ORG_LABELS: Record<OrgKey, string> = {
  amd_megastore: "AMD Megastore SRL",
  caftan_factory: "Caftan Factory",
  homix: "Homix",
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
  latestContract,
  defaultOrgKey,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [infoRequestOpen, setInfoRequestOpen] = useState(false);
  const tplCode = deriveTemplateCode(contractType, workTimeKind, weeklyHours);
  const [orgKey, setOrgKey] = useState<OrgKey>(defaultOrgKey ?? "amd_megastore");
  const [employerEmail, setEmployerEmail] = useState<string>("hr@caftanfactory.com");
  const [mailBody, setMailBody] = useState<string>(DEFAULT_MAIL_BODY);
  const [pending, startTransition] = useTransition();
  // Karim 2026-05-30 : calcul des champs manquants - separe admin vs candidate
  const missing: MissingField[] = getMissingFields(employeeRecord, contractType);
  const isReady = missing.length === 0;
  const missingCandidate = missing.filter((m) => !m.adminOnly);
  const missingAdmin = missing.filter((m) => m.adminOnly);

  // Karim 2026-06-03 : bypass admin warnings screening
  const [bypassReason, setBypassReason] = useState("");
  const [showBypass, setShowBypass] = useState(false);

  // Karim 2026-06-15 : discordances fiche<->contrat signalées avant envoi.
  const [discrepancies, setDiscrepancies] = useState<
    Array<{ field: string; label: string; profileValue: string; contractValue: string }>
  >([]);

  // Karim 2026-06-15 : récapitulatif éditable des paramètres du contrat.
  // Pré-rempli depuis employeeRecord (= valeurs actuelles de la fiche).
  const [terms, setTerms] = useState({
    contract_type: String(employeeRecord.contract_type ?? contractType ?? ""),
    work_time_kind: String(employeeRecord.work_time_kind ?? workTimeKind ?? "full"),
    weekly_hours: String(employeeRecord.weekly_hours ?? weeklyHours ?? ""),
    start_date: String(employeeRecord.start_date ?? ""),
    end_date: String(employeeRecord.end_date ?? ""),
    job_title: String(employeeRecord.job_title ?? ""),
    hourly_rate: String(employeeRecord.hourly_rate ?? ""),
  });
  const [termsSaved, setTermsSaved] = useState(false);
  const [termsPending, startTermsTransition] = useTransition();

  function handleSaveTerms() {
    startTermsTransition(async () => {
      const res = await saveContractTermsAction(employeeId, {
        contract_type: terms.contract_type || undefined,
        work_time_kind: terms.work_time_kind || undefined,
        weekly_hours: terms.weekly_hours !== "" ? Number(terms.weekly_hours) : undefined,
        start_date: terms.start_date || undefined,
        end_date: "end_date" in terms ? (terms.end_date || null) : undefined,
        job_title: terms.job_title || undefined,
        hourly_rate: terms.hourly_rate !== "" ? Number(terms.hourly_rate) : undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setTermsSaved(true);
      toast.success("Paramètres enregistrés — la fiche est à jour.");
      router.refresh();
    });
  }

  function handleSubmit(accept = false) {
    if (!employeeEmail) {
      toast.error("Email de l'employé manquant - complète la fiche d'abord.");
      return;
    }
    startTransition(async () => {
      const res = await sendContractForSignatureAction({
        employeeId,
        templateCode: tplCode,
        orgKey,
        employerEmail,
        customMailBody: mailBody !== DEFAULT_MAIL_BODY ? mailBody : undefined,
        bypassScreening: bypassReason.trim() ? { reason: bypassReason.trim() } : undefined,
        acceptDiscrepancies: accept || undefined,
      });
      // Discordances fiche<->contrat : on les SIGNALE, l'opérateur valide l'alignement.
      if (res.discrepancies && res.discrepancies.length > 0) {
        setDiscrepancies(res.discrepancies);
        return;
      }
      if (res.error) {
        // Si erreur screening, propose le bypass
        if (res.error.includes("screening") || res.error.includes("questionnaire") || res.error.includes("VALIDÉ par RH") || res.error.includes("PASS")) {
          setShowBypass(true);
        }
        toast.error(res.error);
        return;
      }
      toast.success(
        accept
          ? `Fiche alignée sur le contrat et contrat envoyé à signer. ${employeeName} reçoit le lien sécurisé.`
          : `Contrat envoyé à signer. ${employeeName} reçoit un lien de signature sécurisé, ${ORG_LABELS[orgKey]} une copie d'archive.`,
      );
      setDiscrepancies([]);
      setOpen(false);
      router.refresh();
    });
  }

  // Karim 2026-06-03 : etats UI dependants de docuseal_status / signed_at
  // - completed (toutes parties signe) -> "Voir contrat signé" (link PDF)
  // - sent/opened/pending (envoye mais pas finalise) -> "Attente de signature"
  // - declined / null / no contract -> bouton classique "Envoyer a signer"
  const ds = latestContract?.docusealStatus ?? null;
  const isFullySigned = !!latestContract?.signedAt || ds === "completed";
  const isAwaitingSignature = !isFullySigned && (ds === "sent" || ds === "opened" || ds === "pending");

  return (
    <>
      {isFullySigned ? (
        <a
          href={latestContract?.signedPdfUrl ?? `/planning/employees/${employeeId}/contract/${latestContract?.id ?? ""}`}
          target={latestContract?.signedPdfUrl ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold"
          title={latestContract?.signedAt ? `Signé le ${new Date(latestContract.signedAt).toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" })}` : "Contrat signé"}
        >
          <Download className="h-3.5 w-3.5" /> Voir contrat signé
        </a>
      ) : isAwaitingSignature ? (
        // Karim 2026-07-04 : action déjà effectuée (contrat envoyé) -> bouton GRISÉ,
        // non-cliquable, sans clignotement (statut passif : on attend l'employé).
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Contrat déjà envoyé — en attente de la signature de l'employé."
          className="border-amber-300 text-amber-700 bg-amber-50 opacity-70 cursor-not-allowed"
        >
          <Clock className="h-3.5 w-3.5" /> Envoyé — attente signature
        </Button>
      ) : isReady ? (
        <Button
          variant="default"
          size="sm"
          onClick={() => setOpen(true)}
          title="Tous les champs requis sont remplis - prêt à envoyer. C'est la prochaine action à effectuer."
          className="bg-green-600 hover:bg-green-700 text-white pulse-attention"
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
            <DialogTitle>Envoyer le contrat à signer</DialogTitle>
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
            {/* Karim 2026-06-15 : récapitulatif éditable des paramètres du contrat.
                L'opérateur peut corriger avant d'envoyer. saveContractTermsAction
                écrit dans employees AVANT l'envoi (resolveContractRenderInputs relit
                la fiche → cohérence WYSIWYG garantie). */}
            <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900">📋 Récapitulatif du contrat</span>
                {termsSaved && (
                  <span className="text-[10px] text-emerald-700 font-semibold">✓ enregistré</span>
                )}
              </div>

              {/* Employé — lecture seule */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Employé</label>
                <span className="text-xs text-ink-1 font-semibold">{employeeName}</span>
              </div>

              {/* Type de contrat */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Type de contrat</label>
                <select
                  value={terms.contract_type}
                  onChange={(e) => { setTerms((t) => ({ ...t, contract_type: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="CDD">CDD</option>
                  <option value="CDI">CDI</option>
                  <option value="Étudiant">Étudiant</option>
                </select>
              </div>

              {/* Régime horaire */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Régime</label>
                <select
                  value={terms.work_time_kind}
                  onChange={(e) => { setTerms((t) => ({ ...t, work_time_kind: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="full">Temps plein</option>
                  <option value="part">Temps partiel</option>
                </select>
              </div>

              {/* Heures/semaine */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Heures/semaine</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={terms.weekly_hours}
                  onChange={(e) => { setTerms((t) => ({ ...t, weekly_hours: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                  placeholder="ex: 38"
                />
              </div>

              {/* Date de début */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Date de début</label>
                <input
                  type="date"
                  value={terms.start_date}
                  onChange={(e) => { setTerms((t) => ({ ...t, start_date: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                />
              </div>

              {/* Date de fin (optionnelle) */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Date de fin</label>
                <input
                  type="date"
                  value={terms.end_date}
                  onChange={(e) => { setTerms((t) => ({ ...t, end_date: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                  placeholder="(laisser vide si sans terme)"
                />
                {terms.end_date && (
                  <button
                    type="button"
                    onClick={() => { setTerms((t) => ({ ...t, end_date: "" })); setTermsSaved(false); }}
                    className="text-[10px] text-rose-600 hover:underline flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Poste / Fonction */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Poste / Fonction</label>
                <input
                  type="text"
                  value={terms.job_title}
                  onChange={(e) => { setTerms((t) => ({ ...t, job_title: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                  placeholder="ex: Vendeur(se)"
                />
              </div>

              {/* Taux horaire brut */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-ink-2 w-32 flex-shrink-0">Taux horaire brut</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={terms.hourly_rate}
                  onChange={(e) => { setTerms((t) => ({ ...t, hourly_rate: e.target.value })); setTermsSaved(false); }}
                  className="flex-1 border border-line rounded px-2 py-1 text-xs bg-white"
                  placeholder="ex: 14.50"
                />
                <span className="text-[10px] text-ink-3 flex-shrink-0">€/h</span>
              </div>

              {/* Bouton enregistrer */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={termsPending}
                onClick={handleSaveTerms}
                className="w-full text-xs border-blue-300 text-blue-800 hover:bg-blue-100"
              >
                {termsPending ? "Enregistrement…" : "💾 Enregistrer les corrections"}
              </Button>

              {/* Dérivation du template (debug) */}
              <details className="mt-0.5">
                <summary className="text-[9px] text-ink-3 cursor-pointer">Détails du calcul (debug)</summary>
                <div className="text-[10px] bg-white/80 border border-blue-100 p-2 rounded mt-1 font-mono leading-relaxed">
                  contract_type = <strong>{contractType ?? "null"}</strong><br />
                  work_time_kind = <strong>{workTimeKind ?? "null"}</strong><br />
                  weekly_hours = <strong>{weeklyHours ?? "null"}</strong><br />
                  → template dérivé = <strong>{tplCode}</strong> ({TEMPLATE_LABELS[tplCode]})
                </div>
                <p className="text-[10px] text-amber-700 mt-1">
                  Ces valeurs viennent de la BD (rechargées après « Enregistrer »).
                  Si tu as modifié sans enregistrer, le template affiché peut être décalé.
                </p>
              </details>
            </div>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Entité émettrice</label>
              <div className="inline-flex gap-1 rounded-md border border-line bg-surface p-0.5">
                {(["amd_megastore", "caftan_factory", "homix"] as OrgKey[]).map((k) => (
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
            {/* Karim 2026-06-03 : bypass admin warnings screening */}
            <div className="border-t border-amber-200 bg-amber-50/40 pt-3 mt-3 -mx-3 px-3 -mb-3 pb-3 rounded-b text-[11px]">
              <button
                type="button"
                onClick={() => setShowBypass(!showBypass)}
                className="text-amber-900 font-semibold underline"
              >
                {showBypass ? "▼" : "▶"} Bypass screening admin (avancé)
              </button>
              {showBypass && (
                <div className="mt-2 space-y-1">
                  <div className="text-amber-800">
                    ⚠ Outrepasse les checks (screening incomplet, recommandation PASS, ou non validé RH).
                    Raison obligatoire et loggée dans activity_log pour audit.
                  </div>
                  <input
                    type="text"
                    value={bypassReason}
                    onChange={(e) => setBypassReason(e.target.value)}
                    placeholder="Ex: Test admin / Candidat connu / Décision spéciale RH"
                    className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="button" size="sm" onClick={() => handleSubmit(false)} disabled={pending || !employeeEmail}>
              {pending ? "Envoi…" : (bypassReason.trim() ? "Envoyer à signer (BYPASS)" : "Envoyer à signer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Karim 2026-06-15 : discordances fiche<->contrat — signalées avant envoi.
          L'opérateur valide l'alignement de la fiche sur le contrat (le contrat fait foi). */}
      <Dialog open={discrepancies.length > 0} onOpenChange={(o) => { if (!o && !pending) setDiscrepancies([]); }}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Discordances fiche ↔ contrat
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-ink-2">
              La fiche de <strong>{employeeName}</strong> et le contrat préparé divergent.
              Le <strong>contrat fait foi</strong> pour le document signé. Si tu valides,
              la fiche sera <strong>alignée sur le contrat</strong> puis le contrat envoyé.
            </p>
            <div className="rounded border border-amber-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-amber-50 text-amber-900">
                  <tr>
                    <th className="text-left px-2 py-1 font-bold">Champ</th>
                    <th className="text-left px-2 py-1 font-bold">Fiche actuelle</th>
                    <th className="text-left px-2 py-1 font-bold">Contrat (retenu)</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map((d) => (
                    <tr key={d.field} className="border-t border-amber-100">
                      <td className="px-2 py-1 font-semibold">{d.label}</td>
                      <td className="px-2 py-1 text-rose-700 line-through">{d.profileValue}</td>
                      <td className="px-2 py-1 text-emerald-700 font-bold">{d.contractValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-ink-3">
              L&apos;alignement est tracé dans le journal d&apos;activité (audit).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDiscrepancies([])} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleSubmit(true)} disabled={pending}>
              {pending ? "Envoi…" : "Aligner la fiche et envoyer"}
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
