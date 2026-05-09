"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { toast } from "sonner";
import {
  Check,
  X,
  Mail,
  Copy,
  Trash2,
  Send,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Link2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  requestDocumentAction,
  bulkRequestMissingDocsAction,
  validateDocumentAction,
  revokeTokenAction,
  type PreparedDocEmail,
} from "./documents-actions";
import type { MissingDoc } from "@/lib/documents/missing";
import { logEmailSentAction } from "@/app/rh/email/actions";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

let emailjsInitialized = false;
function ensureEmailJSInit() {
  if (emailjsInitialized || !PUBLIC_KEY) return emailjsInitialized;
  try {
    emailjs.init({ publicKey: PUBLIC_KEY });
    emailjsInitialized = true;
  } catch (e) {
    console.warn("EmailJS init failed:", e);
  }
  return emailjsInitialized;
}

const emailjsConfigured = !!(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);

export type ReceivedDoc = {
  id: string;
  file_name: string;
  catalog_slug: string | null;
  catalog_label: string;
  kind: string;
  validation_status: string | null;
  rejection_reason: string | null;
  created_at: string;
  validated_at: string | null;
  signed_url: string | null;
};

export type ActiveTokenView = {
  id: string;
  token: string;
  doc_slug: string | null;
  doc_label: string;
  expires_at: string;
  created_at: string;
  hint: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  admin: "Administratif",
  legal: "Légal",
  bank: "Bancaire",
  medical: "Médical",
  other: "Autre",
};

export function DocumentsPanelClient({
  applicationId,
  baseUrl,
  docs,
  missing,
  tokens,
}: {
  applicationId: string;
  baseUrl: string;
  docs: ReceivedDoc[];
  missing: MissingDoc[];
  tokens: ActiveTokenView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busySlug, setBusySlug] = useState<string | null>(null);

  async function sendPreparedEmail(email: PreparedDocEmail) {
    if (!emailjsConfigured) {
      toast.warning("EmailJS non configuré — copie le lien et envoie-le à la main.");
      try {
        await navigator.clipboard.writeText(email.upload_url);
        toast.info("Lien copié dans le presse-papier.");
      } catch {
        /* ignore */
      }
      return;
    }
    ensureEmailJSInit();
    try {
      await emailjs.send(
        SERVICE_ID!,
        TEMPLATE_ID!,
        {
          to_email: email.to_email,
          to_name: email.to_name,
          from_name: FROM_NAME,
          reply_to: REPLY_TO,
          subject: email.subject,
          message: email.body,
        },
        { publicKey: PUBLIC_KEY! },
      );
      if (email.application_id) {
        await logEmailSentAction(email.application_id, email.subject, email.body, "emailjs");
      }
      toast.success(`Email envoyé à ${email.to_email}`);
    } catch (e) {
      const err = (e as { text?: string; message?: string })?.text ?? (e as Error)?.message ?? "EmailJS error";
      toast.error(`Échec : ${err}`);
    }
  }

  function onRequest(slug: string, sendEmail: boolean) {
    setBusySlug(slug);
    startTransition(async () => {
      const res = await requestDocumentAction(applicationId, slug, sendEmail);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        if (sendEmail && res.email) {
          await sendPreparedEmail(res.email);
        } else {
          try {
            await navigator.clipboard.writeText(res.url);
            toast.success("Lien créé et copié.");
          } catch {
            toast.success("Lien créé.");
          }
        }
        router.refresh();
      }
      setBusySlug(null);
    });
  }

  function onBulk() {
    if (!confirm("Demander tous les documents manquants au candidat ?")) return;
    startTransition(async () => {
      const res = await bulkRequestMissingDocsAction(applicationId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (res.created === 0) {
        toast.info("Aucun nouveau lien à créer.");
        return;
      }
      // Envoie chaque email séquentiellement
      for (const e of res.emails) {
        await sendPreparedEmail(e);
      }
      toast.success(`${res.created} demande(s) créée(s).`);
      router.refresh();
    });
  }

  function onValidate(documentId: string, accepted: boolean) {
    let reason: string | undefined;
    if (!accepted) {
      const r = prompt("Motif de rejet (visible dans l'historique) :");
      if (!r) return;
      reason = r;
    }
    startTransition(async () => {
      const res = await validateDocumentAction(documentId, accepted, reason);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(
          accepted
            ? `Document validé.${res.onboardingItemDone ? " Item onboarding coché auto." : ""}`
            : "Document rejeté.",
        );
        router.refresh();
      }
    });
  }

  function onRevoke(tokenId: string) {
    if (!confirm("Révoquer ce lien magique ?")) return;
    startTransition(async () => {
      const res = await revokeTokenAction(tokenId);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Lien révoqué.");
        router.refresh();
      }
    });
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.info("Lien copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  }

  // Group docs and missing by category
  const docsByCat = groupBy(docs, (d) =>
    d.catalog_slug ? guessCategory(d.catalog_slug) : "other",
  );
  const missingByCat = groupBy(missing, (m) => m.category);

  return (
    <div className="space-y-4">
      {/* Documents reçus */}
      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="text-sm font-bold">Documents reçus ({docs.length})</div>
        </div>
        {docs.length === 0 ? (
          <div className="p-4 text-sm text-ink-3">Aucun document reçu.</div>
        ) : (
          <div className="divide-y divide-line">
            {Object.entries(docsByCat).map(([cat, items]) => (
              <div key={cat} className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                <ul className="space-y-1.5">
                  {items.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm py-1">
                      <FileText className="h-4 w-4 text-ink-3 shrink-0" />
                      <span className="font-semibold">{d.catalog_label}</span>
                      {d.signed_url ? (
                        <a
                          href={d.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gold-dark underline truncate max-w-[200px]"
                        >
                          {d.file_name}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-3 truncate max-w-[200px]">{d.file_name}</span>
                      )}
                      <span className="text-[10px] text-ink-3 ml-auto">
                        {formatDateTime(d.created_at)}
                      </span>
                      {d.validation_status === "accepted" ? (
                        <Badge variant="hired" className="text-[10px] px-1.5 py-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Validé
                        </Badge>
                      ) : d.validation_status === "rejected" ? (
                        <Badge variant="refused" className="text-[10px] px-1.5 py-0.5" title={d.rejection_reason ?? ""}>
                          <X className="h-3 w-3" /> Rejeté
                        </Badge>
                      ) : (
                        <Badge variant="new" className="text-[10px] px-1.5 py-0.5">
                          <Clock className="h-3 w-3" /> En attente
                        </Badge>
                      )}
                      {d.validation_status !== "accepted" ? (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => onValidate(d.id, true)}
                          disabled={pending}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      ) : null}
                      {d.validation_status !== "rejected" ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onValidate(d.id, false)}
                          disabled={pending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Documents manquants */}
      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-bold">
            Documents manquants ({missing.filter((m) => !m.hasFile).length})
          </div>
          {missing.some((m) => !m.hasFile && !m.has_pending_token) ? (
            <Button variant="gold" size="sm" onClick={onBulk} disabled={pending}>
              <Send className="h-3.5 w-3.5" /> Demander tous les documents manquants
            </Button>
          ) : null}
        </div>
        {missing.length === 0 ? (
          <div className="p-4 text-sm text-ink-3">Aucun document requis identifié.</div>
        ) : (
          <div className="divide-y divide-line">
            {Object.entries(missingByCat).map(([cat, items]) => (
              <div key={cat} className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                <ul className="space-y-1.5">
                  {items.map((m) => (
                    <li key={m.slug} className="flex items-center gap-2 text-sm py-1">
                      {m.hasFile ? (
                        m.validation_status === "accepted" ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : m.validation_status === "rejected" ? (
                          <AlertCircle className="h-4 w-4 text-danger shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-ink-3 shrink-0" />
                        )
                      ) : (
                        <AlertCircle className="h-4 w-4 text-ink-3 shrink-0" />
                      )}
                      <span className={m.hasFile ? "font-semibold line-through text-ink-3" : "font-semibold"}>
                        {m.label}
                      </span>
                      {m.description ? (
                        <span className="text-[10px] text-ink-3 truncate">{m.description}</span>
                      ) : null}
                      {m.has_pending_token ? (
                        <Badge variant="contacted" className="text-[10px] px-1.5 py-0.5 ml-auto">
                          <Link2 className="h-3 w-3" /> Lien actif
                        </Badge>
                      ) : null}
                      {!m.hasFile && !m.has_pending_token ? (
                        <div className="ml-auto flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRequest(m.slug, false)}
                            disabled={pending && busySlug === m.slug}
                            title="Créer le lien et le copier dans le presse-papier"
                          >
                            <Copy className="h-3 w-3" /> Lien
                          </Button>
                          <Button
                            size="sm"
                            variant="gold"
                            onClick={() => onRequest(m.slug, true)}
                            disabled={pending && busySlug === m.slug}
                          >
                            <Mail className="h-3 w-3" /> Demander
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Liens magiques actifs */}
      <Card>
        <div className="p-4 border-b border-line">
          <div className="text-sm font-bold">Liens magiques actifs ({tokens.length})</div>
        </div>
        {tokens.length === 0 ? (
          <div className="p-4 text-sm text-ink-3">Aucun lien magique en cours.</div>
        ) : (
          <ul className="divide-y divide-line">
            {tokens.map((t) => {
              const url = `${baseUrl.replace(/\/$/, "")}/upload/${t.token}`;
              const expires = new Date(t.expires_at).getTime();
              const now = Date.now();
              const remainingDays = Math.max(0, Math.ceil((expires - now) / 86_400_000));
              return (
                <li key={t.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4 text-ink-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{t.doc_label}</div>
                    <div className="text-[10px] text-ink-3 font-mono truncate">{url}</div>
                  </div>
                  <Badge variant="contacted" className="text-[10px] px-1.5 py-0.5">
                    {remainingDays}j restant{remainingDays > 1 ? "s" : ""}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => copyUrl(url)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onRevoke(t.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function groupBy<T, K extends string>(items: T[], key: (it: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ??= []).push(it);
  }
  return out;
}

const SLUG_TO_CATEGORY: Record<string, string> = {
  cv: "admin",
  cover_letter: "admin",
  id_card_front: "legal",
  id_card_back: "legal",
  nrn_proof: "legal",
  iban: "bank",
  contract_signed: "legal",
  dimona_proof: "legal",
  mutuelle_certificate: "medical",
  medical_certificate: "medical",
  family_allowance_caisse: "admin",
  transport_subscription: "admin",
  diploma: "admin",
  other: "other",
};
function guessCategory(slug: string): string {
  return SLUG_TO_CATEGORY[slug] ?? "other";
}
