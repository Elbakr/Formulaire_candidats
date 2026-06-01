"use client";

// Karim 2026-06-01 : bouton admin sur la fiche employee pour declencher
// la procedure de rupture amiable. Dialog avec : date, representant, ville,
// note + actions Imprimer / Envoyer signature.

import { useState, useTransition } from "react";
import { FileSignature, Printer, Mail, Eye, AlertTriangle, Loader2 } from "lucide-react";
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
    const res = await getTerminationLetterUrlAction(createdId);
    if (!res.ok || !res.url) {
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
    window.open(url, "_blank");
  }

  async function handleSend() {
    if (!createdId) return;
    startTransition(async () => {
      const res = await sendTerminationForSignatureAction(createdId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Lettre envoyée à l'employé pour signature.");
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
                <Button variant="gold" onClick={handleSend} disabled={pending}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Envoyer signature
                </Button>
              </div>
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
