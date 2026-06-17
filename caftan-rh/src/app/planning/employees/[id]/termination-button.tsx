"use client";

// Karim 2026-06-01 : bouton admin sur la fiche employee pour declencher
// la procedure de rupture amiable. Dialog avec : date, representant, ville,
// note + actions Imprimer / Envoyer signature.

import { useState, useTransition, useEffect } from "react";
import { FileSignature, Printer, Mail, Eye, AlertTriangle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  initiateTerminationByRHAction,
  approveTerminationAction,
  getTerminationLetterUrlAction,
  sendTerminationForSignatureAction,
  getTerminationContextAction,
} from "./termination-actions";

interface Props {
  employeeId: string;
  employeeFullName: string;
  defaultRepresentativeName?: string;
  pendingTermination?: { id: string; initiated_by: string; status: string; earliest_effective_date: string; request_note: string | null } | null;
}

function todayPlus(d: number): string {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}

interface TerminationHistoryRow {
  id: string;
  status: string;
  initiated_by: string;
  requested_at: string;
  effective_date: string | null;
  sent_for_signature_at: string | null;
  initiator_name: string | null;
  employer_representative_name: string | null;
}

export function TerminationButton({ employeeId, employeeFullName, defaultRepresentativeName, pendingTermination }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [effectiveDate, setEffectiveDate] = useState(
    pendingTermination?.earliest_effective_date ?? todayPlus(3),
  );
  const [representativeName, setRepresentativeName] = useState(defaultRepresentativeName ?? "");
  const [city, setCity] = useState("Schaerbeek");
  const [note, setNote] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(pendingTermination?.id ?? null);
  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<TerminationHistoryRow[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);

  // Karim 2026-06-02 : chargement context au moment de l'ouverture du dialog
  useEffect(() => {
    if (!open) return;
    setLoadingContext(true);
    (async () => {
      const r = await getTerminationContextAction(employeeId);
      if (r.ok) {
        setRecipientEmail(r.employee_email);
        setHistory(r.history);
      }
      setLoadingContext(false);
    })();
  }, [open, employeeId]);

  const isPendingFromWorker = pendingTermination?.initiated_by === "employee" && pendingTermination.status === "pending_admin";
  const minDate = pendingTermination?.earliest_effective_date ?? todayPlus(0);

  async function handleCreateOrApprove() {
    if (!representativeName.trim()) {
      toast.error("Indique le représentant employeur");
      return;
    }
    startTransition(async () => {
      let resTerminationId: string | null = null;
      if (isPendingFromWorker && pendingTermination) {
        const res = await approveTerminationAction({
          terminationId: pendingTermination.id,
          effectiveDate,
          employerRepresentativeName: representativeName,
          city,
          note: note || undefined,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        resTerminationId = pendingTermination.id;
        toast.success("Demande approuvée, lettre générée.");
      } else {
        const res = await initiateTerminationByRHAction({
          employeeId,
          effectiveDate,
          employerRepresentativeName: representativeName,
          city,
          approvalNote: note || undefined,
        });
        if (res.error || !res.data) {
          toast.error(res.error ?? "Erreur");
          return;
        }
        resTerminationId = res.data.terminationId;
        toast.success("Convention créée.");
      }
      setCreatedId(resTerminationId);
    });
  }

  async function openLetter(autoPrint: boolean) {
    if (!createdId) return;
    // window.open APRÈS un await est bloqué sur mobile/PWA iOS : on ouvre
    // l'onglet synchronement (préserve le geste), puis on y pose l'URL.
    const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
    const res = await getTerminationLetterUrlAction(createdId);
    if (!res.ok || !res.url) {
      if (win && !win.closed) win.close();
      toast.error(res.error ?? "URL KO");
      return;
    }
    // Karim 2026-06-01 : path relatif + window.location.origin pour rester
    // meme-origine (preserve cookies de session admin).
    let url = res.url.startsWith("http") ? res.url : `${window.location.origin}${res.url}`;
    if (autoPrint) {
      // Karim 2026-06-01 : "Imprimer" = version pour signature manuelle
      // (mention manuscrite « lu et approuvé » + cases vides) + auto Ctrl+P.
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}mode=print&print=1`;
    }
    if (win && !win.closed) win.location.href = url;
    else window.location.href = url;
  }

  async function handleSend() {
    if (!createdId) return;
    if (!recipientEmail) {
      toast.error("Email employé manquant - complète la fiche d'abord");
      return;
    }
    // Anti-doublon : prévenir si une rupture similaire (sent_for_signature) existe deja dans les 7 derniers jours
    const recentSent = history.find((h) => h.id !== createdId && h.sent_for_signature_at && (Date.now() - new Date(h.sent_for_signature_at).getTime()) < 7 * 24 * 3600 * 1000 && !["refused", "cancelled"].includes(h.status));
    if (recentSent) {
      const ok = confirm(`⚠ Une rupture a déjà été envoyée à cet employé le ${new Date(recentSent.sent_for_signature_at!).toLocaleDateString("fr-BE")} par ${recentSent.initiator_name ?? "?"}. Envoyer quand même ?`);
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await sendTerminationForSignatureAction(createdId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Lettre envoyée à ${recipientEmail} pour signature.`);
      setOpen(false);
    });
  }

  const label = isPendingFromWorker ? "Demande rupture (à valider)" : "Rupture amiable";
  const variant = isPendingFromWorker ? "danger" : "outline";

  return (
    <>
      <Button variant={variant as "outline" | "danger"} size="sm" onClick={() => setOpen(true)}>
        <FileSignature className="h-3.5 w-3.5" /> {label}
        {isPendingFromWorker && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 ml-1" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rupture de contrat - Commun accord</DialogTitle>
            <DialogDescription>
              {isPendingFromWorker
                ? `Demande initiée par ${employeeFullName}. Date minimale autorisée : ${minDate} (cooling-off 3 jours).`
                : `Génère la convention 402.00 pour ${employeeFullName}. Tu pourras ensuite l'imprimer ou l'envoyer.`}
            </DialogDescription>
          </DialogHeader>

          {isPendingFromWorker && pendingTermination?.request_note && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
              <div className="font-semibold mb-1">Motif indiqué par le travailleur :</div>
              <div className="italic">{pendingTermination.request_note}</div>
            </div>
          )}

          {/* Karim 2026-06-02 : email destinataire visible */}
          <div className={`text-xs rounded p-2 ${recipientEmail ? "bg-blue-50 border border-blue-200" : "bg-red-50 border border-red-200"}`}>
            <span className="font-semibold">Destinataire signature :</span>{" "}
            {loadingContext ? (
              <span className="italic text-ink-3">chargement...</span>
            ) : recipientEmail ? (
              <span className="font-mono">{recipientEmail}</span>
            ) : (
              <span className="text-red-700 italic">⚠ Aucun email enregistré pour cet employé. Complète la fiche.</span>
            )}
          </div>

          {/* Karim 2026-06-02 : historique ruptures anti-doublon */}
          {history.length > 0 && (
            <details className="text-xs bg-muted/30 border border-line rounded p-2">
              <summary className="cursor-pointer font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Historique ruptures pour {employeeFullName} ({history.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {history.map((h) => {
                  const sentDate = h.sent_for_signature_at ? new Date(h.sent_for_signature_at).toLocaleDateString("fr-BE", { dateStyle: "long" }) : null;
                  const reqDate = new Date(h.requested_at).toLocaleDateString("fr-BE", { dateStyle: "long" });
                  return (
                    <div key={h.id} className="border-l-2 border-line pl-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-line">{h.status}</span>
                        <span className="text-[10px] text-ink-3">init: {h.initiated_by}</span>
                      </div>
                      <div className="text-[11px] mt-0.5">
                        <strong>Demandée :</strong> {reqDate}
                        {h.initiator_name && <span> par <strong>{h.initiator_name}</strong></span>}
                      </div>
                      {sentDate && (
                        <div className="text-[11px] text-blue-700">
                          <Mail className="w-3 h-3 inline mr-1" />
                          Envoyée pour signature : {sentDate}
                          {h.employer_representative_name && <span> (représentée par {h.employer_representative_name})</span>}
                        </div>
                      )}
                      {h.effective_date && (
                        <div className="text-[11px] text-ink-3">Date fin contrat : {h.effective_date}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {!createdId ? (
            <div className="space-y-3 py-2">
              <div>
                <Label>Date de fin du contrat</Label>
                <Input
                  type="date"
                  min={minDate}
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Représentant employeur</Label>
                <Input
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="Ex. Karim Elbazi"
                />
              </div>
              <div>
                <Label>Ville (Fait à)</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <Label>Note interne (optionnel)</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button variant="gold" onClick={handleCreateOrApprove} disabled={pending}>
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isPendingFromWorker ? "Valider la demande" : "Générer la convention"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                ✓ Convention prête. Choisis comment la transmettre :
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => openLetter(false)}>
                  <Eye className="h-3.5 w-3.5" /> Aperçu
                </Button>
                <Button variant="outline" onClick={() => openLetter(true)}>
                  <Printer className="h-3.5 w-3.5" /> Imprimer
                </Button>
                <Button variant="gold" onClick={handleSend} disabled={pending || !recipientEmail}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Envoyer à {recipientEmail ? recipientEmail.split("@")[0] : "?"}
                </Button>
              </div>
              {/* Karim 2026-06-17 : signature INTERNE — dès que le travailleur signe
                  via son lien, la convention est finalisée automatiquement (PDF + mails
                  aux 2 parties + clôture). Plus de sync manuel à faire. */}
              <p className="text-[11px] text-ink-3 text-center">
                Le travailleur signe via le lien reçu par mail. La convention se finalise
                ensuite automatiquement (PDF + mails aux 2 parties).
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
