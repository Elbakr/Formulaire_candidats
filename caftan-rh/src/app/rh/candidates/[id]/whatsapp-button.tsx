"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  prepareWhatsAppPreviewAction,
  sendWhatsAppAction,
  sendWhatsAppTemplateAction,
} from "./whatsapp-actions";

export type WhatsAppApprovedTemplate = {
  slug: string;
  language_code: string;
  category: string;
  body: string;
  variables_count: number;
  has_content_sid: boolean;
};

export type WhatsAppCandidateBadges = {
  optIn: boolean;
  blocked: boolean;
  inWindow24h: boolean;
};

export function WhatsAppCandidateBadgesView({ state }: { state: WhatsAppCandidateBadges }) {
  return (
    <div className="flex flex-wrap gap-1">
      {state.blocked ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-danger-light text-danger">
          Bloqué WhatsApp
        </span>
      ) : null}
      {!state.blocked && state.optIn ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success-light text-success">
          Opt-in WhatsApp
        </span>
      ) : null}
      {!state.blocked && !state.optIn ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warn-light text-warn">
          Hors opt-in
        </span>
      ) : null}
      {state.inWindow24h ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-info-light text-info">
          Fenêtre 24 h ouverte
        </span>
      ) : null}
    </div>
  );
}

export function WhatsAppButton({
  applicationId,
  candidateName,
  candidatePhone,
  approvedTemplates,
}: {
  applicationId: string;
  candidateName: string;
  candidatePhone: string | null;
  approvedTemplates: WhatsAppApprovedTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"freeform" | "template">("freeform");
  const [templateSlug, setTemplateSlug] = useState<string>("");
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [preview, setPreview] = useState<{
    inWindow: boolean;
    optIn: boolean;
    blocked: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const disabled = !candidatePhone;

  const selectedTemplate = approvedTemplates.find((t) => t.slug === templateSlug) ?? null;

  // When the dialog opens, fetch compliance state to default the right mode.
  useEffect(() => {
    if (!open || !applicationId) return;
    setPreviewLoading(true);
    prepareWhatsAppPreviewAction({ applicationId })
      .then((r) => {
        if (r.error) {
          toast.error(r.error);
          setOpen(false);
          return;
        }
        const inWindow = !!r.in24hWindow;
        const optIn = !!r.hasOptIn;
        const blocked = !!r.isBlocked;
        setPreview({ inWindow, optIn, blocked });
        // Default mode : if not in window AND no opt-in → must use template.
        if (blocked) {
          // Will be caught by the action anyway, but disable both modes.
          setMode("template");
        } else if (!inWindow && approvedTemplates.length > 0) {
          setMode("template");
          if (!templateSlug && approvedTemplates[0]) {
            setTemplateSlug(approvedTemplates[0].slug);
          }
        } else {
          setMode("freeform");
        }
      })
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, applicationId]);

  // Resize variables when template changes.
  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateVars([]);
      return;
    }
    setTemplateVars((prev) => {
      const next = [...prev];
      next.length = selectedTemplate.variables_count;
      for (let i = 0; i < next.length; i++) {
        if (next[i] === undefined) next[i] = "";
      }
      return next;
    });
  }, [selectedTemplate]);

  const reset = () => {
    setOpen(false);
    setBody("");
    setMediaUrl("");
    setTemplateSlug("");
    setTemplateVars([]);
    setPreview(null);
  };

  const blocked = preview?.blocked ?? false;
  const mustUseTemplate = preview ? !preview.inWindow : false;
  const renderedTemplatePreview = (() => {
    if (!selectedTemplate) return "";
    let out = selectedTemplate.body;
    templateVars.forEach((v, i) => {
      out = out.replaceAll(`{{${i + 1}}}`, v || `{{${i + 1}}}`);
    });
    return out;
  })();

  return (
    <>
      <Button
        type="button"
        variant="success"
        disabled={disabled}
        title={disabled ? "Numéro de téléphone manquant pour ce candidat." : undefined}
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-4 w-4" /> WhatsApp
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>WhatsApp — {candidateName}</DialogTitle>
            <DialogDescription>
              Destinataire : <code>{candidatePhone ?? "(numéro manquant)"}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 space-y-3">
            {previewLoading ? (
              <p className="text-sm text-ink-3">Vérification de la conformité…</p>
            ) : null}

            {preview ? (
              <div className="text-xs space-y-1 bg-surface-2 rounded-md p-2">
                <div>
                  Statut conformité :{" "}
                  {preview.blocked ? (
                    <strong className="text-danger">Bloqué (opt-out)</strong>
                  ) : preview.inWindow ? (
                    <strong className="text-success">Fenêtre 24 h ouverte — freeform OK</strong>
                  ) : preview.optIn ? (
                    <strong className="text-warn">Hors fenêtre 24 h — template requis</strong>
                  ) : (
                    <strong className="text-warn">Pas d&apos;opt-in — template UTILITY requis</strong>
                  )}
                </div>
              </div>
            ) : null}

            {blocked ? (
              <div className="rounded-md bg-danger-light p-3 text-sm">
                Ce candidat a demandé l&apos;arrêt des messages WhatsApp (STOP). Aucun envoi possible.
                Pour le débloquer, retire la coche &quot;whatsapp_blocked&quot; depuis le dossier admin.
              </div>
            ) : (
              <>
                {!mustUseTemplate && approvedTemplates.length > 0 ? (
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setMode("freeform")}
                      className={`px-3 py-1.5 rounded-md font-bold ${
                        mode === "freeform"
                          ? "bg-gold text-ink"
                          : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      Message libre
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("template")}
                      className={`px-3 py-1.5 rounded-md font-bold ${
                        mode === "template" ? "bg-gold text-ink" : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      Template
                    </button>
                  </div>
                ) : null}

                {mode === "freeform" ? (
                  <>
                    <div>
                      <Label htmlFor="wa_body">Message</Label>
                      <Textarea
                        id="wa_body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={6}
                        placeholder="Bonjour, votre candidature a bien été reçue…"
                        maxLength={1500}
                      />
                      <p className="text-[11px] text-ink-3 mt-1">
                        {body.length}/1500 caractères
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="wa_media">URL média (optionnel — image/PDF/audio)</Label>
                      <Input
                        id="wa_media"
                        type="url"
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {approvedTemplates.length === 0 ? (
                      <div className="rounded-md bg-warn-light p-3 text-sm space-y-1">
                        <p className="font-bold">Aucun template approuvé.</p>
                        <p>
                          Crée et fais valider un template UTILITY par Meta avant de pouvoir
                          envoyer hors fenêtre 24 h.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label htmlFor="wa_tpl">Template approuvé</Label>
                          <select
                            id="wa_tpl"
                            value={templateSlug}
                            onChange={(e) => setTemplateSlug(e.target.value)}
                            className="w-full h-10 rounded-md border border-line bg-canvas px-3 text-sm font-mono"
                          >
                            <option value="">— choisir un template —</option>
                            {approvedTemplates.map((t) => (
                              <option key={t.slug} value={t.slug}>
                                {t.slug} ({t.variables_count} var.) {t.has_content_sid ? "" : "[no SID]"}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedTemplate ? (
                          <>
                            {selectedTemplate.variables_count > 0 ? (
                              <div className="space-y-2">
                                <Label>Variables</Label>
                                {templateVars.map((v, i) => (
                                  <Input
                                    key={i}
                                    value={v}
                                    onChange={(e) => {
                                      const next = [...templateVars];
                                      next[i] = e.target.value;
                                      setTemplateVars(next);
                                    }}
                                    placeholder={`{{${i + 1}}}`}
                                  />
                                ))}
                              </div>
                            ) : null}
                            <div>
                              <Label>Aperçu</Label>
                              <pre className="bg-surface-2 rounded-md p-2 text-xs whitespace-pre-wrap font-mono">
                                {renderedTemplatePreview}
                              </pre>
                            </div>
                          </>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={reset}>
              Annuler
            </Button>
            {!blocked && mode === "freeform" ? (
              <Button
                variant="gold"
                disabled={pending || !body.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const r = await sendWhatsAppAction({
                      applicationId,
                      body,
                      mediaUrl: mediaUrl.trim() || undefined,
                    });
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success(`WhatsApp envoyé à ${r.recipient}`);
                      reset();
                    }
                  })
                }
              >
                {pending ? "Envoi…" : "Envoyer WhatsApp"}
              </Button>
            ) : null}
            {!blocked && mode === "template" ? (
              <Button
                variant="gold"
                disabled={
                  pending ||
                  !selectedTemplate ||
                  templateVars.length !== (selectedTemplate?.variables_count ?? 0) ||
                  templateVars.some((v) => !v.trim())
                }
                onClick={() =>
                  startTransition(async () => {
                    const r = await sendWhatsAppTemplateAction({
                      applicationId,
                      templateSlug,
                      variables: templateVars,
                    });
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success(`Template envoyé à ${r.recipient}`);
                      reset();
                    }
                  })
                }
              >
                {pending ? "Envoi…" : "Envoyer template"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
