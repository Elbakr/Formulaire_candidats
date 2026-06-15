"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Eye, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { approveExpenseAction, refuseExpenseAction, markExpensePaidAction, getReceiptUrlAction } from "@/app/me/expenses/actions";

export function ExpenseActionsRow({ expenseId, status, hasReceipt, hasIban, qrData }: {
  expenseId: string;
  status: string;
  hasReceipt: boolean;
  hasIban: boolean;
  qrData?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [qrLocal, setQrLocal] = useState<string | null>(qrData ?? null);

  function approve() {
    startTransition(async () => {
      const r = await approveExpenseAction({ expenseId, note: note || undefined });
      if (r.ok) { toast.success("Validée"); setApproveOpen(false); setNote(""); }
      else toast.error(r.error ?? "KO");
    });
  }
  function refuse() {
    if (!reason.trim()) { toast.error("Raison obligatoire"); return; }
    startTransition(async () => {
      const r = await refuseExpenseAction({ expenseId, reason });
      if (r.ok) { toast.success("Refusée"); setRefuseOpen(false); setReason(""); }
      else toast.error(r.error ?? "KO");
    });
  }
  function pay() {
    startTransition(async () => {
      const r = await markExpensePaidAction({ expenseId });
      if (r.ok) {
        toast.success("Marquée payée");
        if (r.qrUrl) { setQrLocal(r.qrUrl); setQrOpen(true); }
      } else toast.error(r.error ?? "KO");
    });
  }
  async function viewReceipt() {
    // window.open APRÈS un await est bloqué sur mobile/PWA iOS : on ouvre
    // l'onglet synchronement (préserve le geste), puis on y pose l'URL.
    const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
    const r = await getReceiptUrlAction(expenseId);
    if (r.ok && r.url) {
      if (win && !win.closed) win.location.href = r.url;
      else window.location.href = r.url;
    } else {
      if (win && !win.closed) win.close();
      toast.error(r.error ?? "URL KO");
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 mt-2 justify-end flex-wrap">
        {hasReceipt && (
          <Button variant="ghost" size="sm" onClick={viewReceipt} title="Voir justificatif">
            <Eye className="w-3 h-3" />
          </Button>
        )}
        {status === "pending" && (
          <>
            <Button variant="gold" size="sm" onClick={() => setApproveOpen(true)}>
              <CheckCircle2 className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRefuseOpen(true)}>
              <XCircle className="w-3 h-3" />
            </Button>
          </>
        )}
        {status === "approved" && hasIban && (
          <Button variant="gold" size="sm" onClick={pay} disabled={pending}>
            <QrCode className="w-3 h-3" /> Payer
          </Button>
        )}
        {qrLocal && (
          <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
            <QrCode className="w-3 h-3" />
          </Button>
        )}
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Valider la note de frais</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Note (optionnel)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Annuler</Button>
            <Button variant="gold" onClick={approve} disabled={pending}>
              {pending && <Loader2 className="w-3 h-3 animate-spin" />} Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refuseOpen} onOpenChange={setRefuseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser la note de frais</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Raison du refus *</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseOpen(false)}>Annuler</Button>
            <Button variant="danger" onClick={refuse} disabled={pending}>Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Paiement EPC SEPA</DialogTitle></DialogHeader>
          {qrLocal && (
            <div className="py-4 text-center space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrLocal} alt="QR EPC" className="mx-auto" />
              <p className="text-xs text-ink-3">Scanne avec ton app bancaire pour pré-remplir le virement.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
