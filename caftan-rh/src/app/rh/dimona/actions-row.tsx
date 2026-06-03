"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { markDimonaDeclaredAction, cancelDimonaDeclarationAction } from "./actions";

export function DimonaActionsRow({ declarationId, status, kind }: { declarationId: string; status: string; kind: string }) {
  const [pending, startTransition] = useTransition();
  const [openMark, setOpenMark] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [note, setNote] = useState("");

  function markDeclared() {
    startTransition(async () => {
      const r = await markDimonaDeclaredAction({ declarationId, periodId: periodId || undefined, note: note || undefined });
      if (r.ok) {
        toast.success("Dimona marquée comme déclarée");
        setOpenMark(false);
      } else toast.error(r.error ?? "KO");
    });
  }
  function cancel() {
    if (!confirm("Annuler cette déclaration Dimona ?")) return;
    startTransition(async () => {
      const r = await cancelDimonaDeclarationAction(declarationId);
      if (r.ok) toast.success("Annulée");
      else toast.error(r.error ?? "KO");
    });
  }

  if (status !== "pending") {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        {status !== "cancelled" && (
          <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
            <XCircle className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href={`https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-line hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" /> Portail ONSS
        </a>
        <Button variant="gold" size="sm" onClick={() => setOpenMark(true)}>
          <CheckCircle2 className="h-3 w-3" /> Marquer déclarée
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
          <XCircle className="h-3 w-3" />
        </Button>
      </div>

      <Dialog open={openMark} onOpenChange={setOpenMark}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marquer Dimona {kind.toUpperCase()} comme déclarée</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-xs text-ink-3">
              Confirme que tu as bien complété la déclaration Dimona sur le portail ONSS.
            </p>
            <div>
              <Label>Period ID Dimona (optionnel, retourné par le portail)</Label>
              <Input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="Ex: 123456789012" />
            </div>
            <div>
              <Label>Note (optionnel)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMark(false)}>Annuler</Button>
            <Button variant="gold" onClick={markDeclared} disabled={pending}>
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
