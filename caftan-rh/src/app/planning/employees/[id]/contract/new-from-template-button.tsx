"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listContractTemplatesAction,
  previewContractFromTemplateAction,
  createContractAndSendForSignatureAction,
} from "./template-actions";

type Tpl = { id: string; code: string; name: string; kind: string };

export function NewContractFromTemplateButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listContractTemplatesAction().then((r) => {
      if (r.error) toast.error(r.error);
      else {
        setTemplates(r.templates);
        if (r.templates.length > 0 && !templateId) setTemplateId(r.templates[0].id);
      }
    });
  }, [open, templateId]);

  useEffect(() => {
    if (!templateId) return;
    startTransition(async () => {
      const r = await previewContractFromTemplateAction({ employeeId, templateId });
      if (r.error) toast.error(r.error);
      else setPreview(r.rendered ?? "");
    });
  }, [templateId, employeeId]);

  function sendForSignature() {
    if (!templateId) return;
    if (
      !window.confirm(
        "Envoyer ce contrat pour signature digitale à l'employé ? Un mail avec un lien magique sera expédié.",
      )
    )
      return;
    startTransition(async () => {
      const r = await createContractAndSendForSignatureAction({ employeeId, templateId });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const mailOk = (r.mailStatus ?? 0) >= 200 && (r.mailStatus ?? 0) < 300;
      toast.success(
        mailOk
          ? `Contrat créé et mail de signature envoyé. Lien : ${r.signingUrl}`
          : `Contrat créé mais l'envoi du mail a échoué (status ${r.mailStatus}). Lien manuel : ${r.signingUrl}`,
        { duration: 12000 },
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSignature className="h-3.5 w-3.5" />
          Nouveau contrat (template)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Générer un contrat depuis un modèle</DialogTitle>
          <DialogDescription>
            Choisis un modèle. Le contenu est pré-rempli avec les données de la fiche employé.
            Tu pourras ajuster avant l'envoi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
              Modèle
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full h-10 rounded-md border border-line bg-surface px-2 text-sm"
            >
              {templates.length === 0 ? (
                <option value="">— chargement —</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex-1 overflow-auto border border-line rounded-md p-3 bg-surface-2/40 text-sm whitespace-pre-wrap font-mono text-[11px]">
            {pending && !preview ? (
              <div className="flex items-center gap-1 text-ink-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération de l'aperçu…
              </div>
            ) : (
              preview || "(aucun aperçu)"
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Fermer
            </Button>
            <Button
              onClick={sendForSignature}
              disabled={pending || !templateId || !preview}
              className="bg-success hover:bg-success/90 text-white"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Envoyer pour signature
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
