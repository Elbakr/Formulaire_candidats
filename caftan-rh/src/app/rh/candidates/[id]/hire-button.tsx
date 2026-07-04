"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CheckCheck,
  Sparkles,
  Copy,
  Check,
  Mail,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { sendEmailViaEmailJS } from "@/lib/emailjs-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hireCandidateAction, type HireResult } from "./hire-actions";
import { hirePrevalidatedCandidateAction } from "../prevalidated-actions";

type Site = { id: string; code: string; name: string };

const CONTRACT_KINDS = ["CDI", "CDD", "Étudiant", "Intérim", "Freelance"] as const;

export function HireCandidateButton({
  applicationId,
  candidateName,
  candidateHasEmail,
  defaultPosition,
  sites,
  alreadyHired,
  prevalidatedCandidateId,
  defaultContractKind = "CDD",
  candidateInitialStudent,
}: {
  applicationId: string;
  candidateName: string;
  candidateHasEmail: boolean;
  defaultPosition: string;
  sites: Site[];
  alreadyHired: boolean;
  // Karim 2026-07-03 : mode CANDIDAT PRÉ-VALIDÉ (sans candidature) — même dialog,
  // route l'embauche vers hirePrevalidatedCandidateAction sans toucher au flux existant.
  prevalidatedCandidateId?: string;
  defaultContractKind?: string;
  // Karim 2026-07-04 : statut ÉTUDIANT déclaré par le candidat lui-même (choix
  // initial). Sert à alerter le RH s'il choisit un contrat qui s'en écarte.
  candidateInitialStudent?: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<HireResult | null>(null);
  const [contractKind, setContractKind] = useState<string>(defaultContractKind);
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  // Karim 2026-07-04 : confirmation explicite requise en cas d'écart avec le choix du candidat.
  const [discrepancyAck, setDiscrepancyAck] = useState(false);

  const today = new Date();
  const defaultStart = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date(today.getTime() + 7 * 86_400_000);
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  });
  const addToStart = (fn: (d: Date) => void): string => {
    const d = new Date(`${startDate || defaultStart}T00:00:00`);
    fn(d);
    return d.toISOString().slice(0, 10);
  };

  // Boutons de période rapide -> fixent la date de fin depuis la date de début.
  const PERIODS: Array<{ label: string; compute: () => string }> = [
    { label: "1 mois", compute: () => addToStart((d) => d.setMonth(d.getMonth() + 1)) },
    { label: "3 mois", compute: () => addToStart((d) => d.setMonth(d.getMonth() + 3)) },
    { label: "6 mois", compute: () => addToStart((d) => d.setMonth(d.getMonth() + 6)) },
    { label: "1 an", compute: () => addToStart((d) => d.setFullYear(d.getFullYear() + 1)) },
    { label: "Fin du mois", compute: () => addToStart((d) => { d.setMonth(d.getMonth() + 1); d.setDate(0); }) },
  ];

  // Écart avec le CHOIX INITIAL du candidat (étudiant vs non-étudiant).
  const isStudentPick = contractKind === "Étudiant" || contractKind === "Etudiant";
  const discrepancy =
    candidateInitialStudent === true && !isStudentPick
      ? "Le candidat s'est déclaré ÉTUDIANT, mais tu as choisi un contrat non-étudiant."
      : candidateInitialStudent === false && isStudentPick
        ? "Le candidat s'est déclaré NON-étudiant, mais tu as choisi un contrat Étudiant."
        : null;

  function submit(formData: FormData) {
    formData.set("contract_kind", contractKind);
    formData.set("site_id", siteId);
    startTransition(async () => {
      const r = prevalidatedCandidateId
        ? await hirePrevalidatedCandidateAction(prevalidatedCandidateId, formData)
        : await hireCandidateAction(applicationId, formData);
      setResult(r);
      if (r.error && !r.ok) {
        toast.error(r.error);
      } else {
        toast.success("Embauche traitée — voir le récap.");
      }
    });
  }

  function copyCreds() {
    if (!result?.credentials) return;
    const c = result.credentials;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Bonjour ${candidateName},\n\nVoici ton accès Caftan Factory :\n\n  URL    : ${url}/login\n  Email  : ${c.email}\n  Mot de passe : ${c.password}\n\nÀ ta première connexion, change le mot de passe dans Mon profil.`;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        toast.success("Copié — colle dans WhatsApp/email.");
      })
      .catch(() => toast.error("Copie impossible."));
  }

  function shareWA() {
    if (!result?.credentials) return;
    const c = result.credentials;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Bonjour ${candidateName}, voici ton accès Caftan Factory :\nURL: ${url}/login\nEmail: ${c.email}\nMot de passe: ${c.password}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function shareMailto() {
    if (!result?.credentials) return;
    const c = result.credentials;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const subject = "Bienvenue chez Caftan Factory — ton accès";
    const body = `Bonjour ${candidateName},\n\nNous sommes ravis de t'accueillir.\n\nVoici tes identifiants :\nURL : ${url}/login\nEmail : ${c.email}\nMot de passe : ${c.password}\n\nMerci de changer ton mot de passe à la première connexion.\n\nL'équipe RH`;
    // Karim 19/05 : envoi via messagerie integree (EmailJS) au lieu de
    // mailto qui ouvrait Outlook.
    const toastId = toast.loading("Envoi de l'email…");
    const r = await sendEmailViaEmailJS({
      to_email: c.email, to_name: candidateName, subject, body_text: body,
    });
    toast.dismiss(toastId);
    if (r.ok) toast.success("Email envoyé via la messagerie intégrée.");
    else toast.error(r.error ?? "Envoi échoué", { duration: 8000 });
  }

  function reset() {
    setResult(null);
    setCopied(false);
  }

  return (
    <>
      <Button
        variant="gold"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        title={
          alreadyHired
            ? "Déjà embauché — ré-ouvre pour compléter les manquements"
            : "Embauche ce candidat en 1 clic"
        }
      >
        <CheckCheck className="h-3.5 w-3.5" />
        {alreadyHired ? "Compléter l'embauche" : "Embaucher"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embauche en 1 clic — {candidateName}</DialogTitle>
            <DialogDescription>
              {result
                ? "Tout est traité — récap des étapes ci-dessous."
                : "Vérifie les paramètres puis lance la procédure. Tu pourras tout éditer après."}
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <form
              ref={formRef}
              action={submit}
              className="px-5 py-4 space-y-3 text-sm"
            >
              <div>
                <Label>Type de contrat</Label>
                <Select value={contractKind} onValueChange={setContractKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {candidateInitialStudent !== null && candidateInitialStudent !== undefined ? (
                  <p className="mt-1 text-[11px] text-ink-3">
                    Choix initial du candidat : <b>{candidateInitialStudent ? "Étudiant" : "Non-étudiant"}</b>.
                  </p>
                ) : null}
                {discrepancy ? (
                  <div className="mt-2 rounded-md border border-warn/50 bg-warn-light/40 p-2 text-[11px] text-warn space-y-1.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        <b>Écart avec le choix du candidat.</b> {discrepancy} Un mauvais régime fausse le
                        contrat, la Dimona (STU/OTH) et les cotisations.
                      </span>
                    </div>
                    <label className="flex items-start gap-2 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={discrepancyAck}
                        onChange={(e) => setDiscrepancyAck(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Je confirme cet écart en connaissance de cause (volontaire et justifié).</span>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="start_date">Date de début</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="end_date">
                    Date de fin{" "}
                    <span className="text-ink-3 font-normal">
                      (CDD/Étudiant)
                    </span>
                  </Label>
                  <Input
                    id="end_date"
                    name="end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={contractKind === "CDI"}
                  />
                </div>
              </div>

              {contractKind !== "CDI" ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] text-ink-3 self-center mr-1">Durée rapide :</span>
                  {PERIODS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEndDate(p.compute())}
                      className="px-2 py-1 rounded-md border border-line bg-surface text-[11px] font-semibold hover:border-gold hover:bg-gold-light/30"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div>
                <Label>Site principal</Label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un site…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="position_title">Poste</Label>
                  <Input
                    id="position_title"
                    name="position_title"
                    type="text"
                    defaultValue={defaultPosition}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="weekly_hours">Heures / semaine</Label>
                  <Input
                    id="weekly_hours"
                    name="weekly_hours"
                    type="number"
                    min={1}
                    max={50}
                    step={0.5}
                    defaultValue={38}
                    required
                  />
                </div>
              </div>

              {!candidateHasEmail ? (
                <div className="text-xs text-warn bg-warn-light/40 rounded-md p-2 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Pas d'email sur la fiche — le compte employé ne sera pas créé,
                  tout le reste se fait quand même.
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" variant="gold" disabled={pending || !siteId || (!!discrepancy && !discrepancyAck)}>
                  {pending ? "Traitement…" : (!!discrepancy && !discrepancyAck) ? "Confirme l'écart pour continuer" : "Lancer l'embauche"}
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="px-5 py-4 space-y-3 text-sm">
              <ul className="space-y-1.5">
                {result.steps.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-snug"
                  >
                    {s.status === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    ) : s.status === "warn" ? (
                      <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="font-bold">{s.label}</span>
                      {s.detail ? (
                        <span className="block text-xs text-ink-3 mt-0.5">
                          {s.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 pt-2 border-t border-line">
                {result.contractId && result.employeeId ? (
                  <Button asChild variant="gold" className="w-full">
                    <Link
                      href={`/planning/employees/${result.employeeId}/contract/${result.contractId}`}
                    >
                      Compléter et signer le contrat
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
                {result.dimonaCreated && result.employeeId ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/planning/employees/${result.employeeId}/dimona`}>
                      Ouvrir checklist Dimona
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>

              {result.credentials ? (
                <div className="space-y-2 pt-2 border-t border-line">
                  <div className="text-xs font-bold text-ink-2">
                    Identifiants à transmettre :
                  </div>
                  <div className="bg-surface-2 rounded-md p-3 font-mono text-xs space-y-1">
                    <div>
                      <span className="text-ink-3">Email : </span>
                      <span className="font-bold">
                        {result.credentials.email}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-3">Mot de passe : </span>
                      <span className="font-bold bg-gold-light px-1 rounded">
                        {result.credentials.password}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={copyCreds} variant="gold" size="sm">
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copié" : "Copier"}
                    </Button>
                    <Button onClick={shareWA} variant="outline" size="sm">
                      <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                    <Button onClick={shareMailto} variant="outline" size="sm">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </Button>
                  </div>
                </div>
              ) : null}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Fermer
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
