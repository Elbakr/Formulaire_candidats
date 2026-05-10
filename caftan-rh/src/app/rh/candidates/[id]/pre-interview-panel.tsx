"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import {
  Send,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
  Sparkles,
  FileText,
  Mail,
  Video as VideoIcon,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  sendPreInterviewAction,
  markPreInterviewDecisionAction,
  discardPreInterviewAction,
} from "./pre-interview-actions";
import { getPreInterviewVideoSignedUrlAction } from "./get-video-signed-url-action";
import {
  POSITION_ROLE_OPTIONS,
  type PreInterview,
  type PreInterviewQuestion,
  type PreInterviewResponse,
  type PreInterviewDecision,
  preInterviewProgress,
  isPreInterviewExpired,
} from "@/lib/pre-interview-types";
import { formatDateTime } from "@/lib/utils";

type Props = {
  applicationId: string;
  candidateName: string;
  candidateEmail?: string | null;
  preInterview: PreInterview | null;
  questions: PreInterviewQuestion[];
  responses: PreInterviewResponse[];
  publicUrl: string | null;
};

const EMAILJS_SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const EMAILJS_FROM = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "Caftan Factory";
const EMAILJS_REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

export function PreInterviewPanel({
  applicationId,
  candidateName,
  candidateEmail,
  preInterview,
  questions,
  responses,
  publicUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [positionRole, setPositionRole] = useState<string>("all");
  const [decisionNote, setDecisionNote] = useState("");

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success("Lien copié."),
      () => toast.error("Impossible de copier."),
    );
  }

  const [emailSending, setEmailSending] = useState(false);
  async function sendByEmail() {
    if (!publicUrl) return;
    if (!candidateEmail) {
      toast.error("Le candidat n'a pas d'email.");
      return;
    }
    if (!EMAILJS_SERVICE || !EMAILJS_TEMPLATE || !EMAILJS_KEY) {
      toast.error(
        "EmailJS non configuré. Copie le lien et envoie-le manuellement.",
      );
      return;
    }
    setEmailSending(true);
    try {
      const firstName = candidateName.split(/\s+/)[0] || candidateName;
      const subject = `Pré-entretien Caftan Factory — ${candidateName}`;
      const messageBody =
        `Bonjour ${firstName},\n\n` +
        `Suite à votre candidature chez Caftan Factory, nous vous invitons à compléter notre pré-entretien en ligne.\n\n` +
        `👉 Cliquez sur le lien ci-dessous pour répondre aux questions (5-10 minutes) :\n${publicUrl}\n\n` +
        (preInterview?.expires_at
          ? `⏰ Le lien expire le ${formatDateTime(preInterview.expires_at)}.\n\n`
          : "") +
        `À très vite,\nL'équipe Caftan Factory`;

      await emailjs.send(
        EMAILJS_SERVICE,
        EMAILJS_TEMPLATE,
        {
          to_email: candidateEmail,
          to_name: candidateName,
          from_name: EMAILJS_FROM,
          reply_to: EMAILJS_REPLY_TO,
          subject,
          message: messageBody,
          html_message: messageBody.replace(/\n/g, "<br>"),
        },
        { publicKey: EMAILJS_KEY },
      );
      toast.success(`Email envoyé à ${candidateEmail}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec d'envoi.";
      toast.error(`Échec EmailJS : ${msg}`);
    } finally {
      setEmailSending(false);
    }
  }

  function send() {
    startTransition(async () => {
      const res = await sendPreInterviewAction({ applicationId, positionRole });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pré-entretien envoyé. Lien généré.");
      router.refresh();
    });
  }

  function decide(decision: PreInterviewDecision) {
    if (!preInterview) return;
    startTransition(async () => {
      const res = await markPreInterviewDecisionAction({
        preInterviewId: preInterview.id,
        decision,
        note: decisionNote || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const labels: Record<PreInterviewDecision, string> = {
        shortlist: "Shortlist enregistrée.",
        reject: "Candidature refusée.",
        reserve: "Candidat mis en réserve.",
      };
      toast.success(labels[decision]);
      router.refresh();
    });
  }

  function discard() {
    if (!preInterview) return;
    if (!confirm("Annuler ce pré-entretien ? Le lien deviendra invalide.")) return;
    startTransition(async () => {
      const res = await discardPreInterviewAction(preInterview.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pré-entretien annulé.");
      router.refresh();
    });
  }

  // ─────────────────────────────────────── UI states ──────────────────────────

  // No pre-interview yet -> show send form
  if (!preInterview || preInterview.status === "discarded") {
    return (
      <Card>
        <div className="p-4 space-y-4">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-dark" />
              Envoyer un pré-entretien écrit à {candidateName}
            </h3>
            <p className="text-xs text-ink-3 mt-1">
              5 à 10 minutes pour le candidat. Réponses sauvegardées automatiquement,
              valides pendant 5 jours.
            </p>
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label htmlFor="pi-role">Profil de poste</Label>
              <Select value={positionRole} onValueChange={setPositionRole}>
                <SelectTrigger id="pi-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-ink-3 mt-1">
                Détermine quelles questions seront posées (générales + spécifiques au rôle).
              </p>
            </div>
            <Button variant="gold" disabled={pending} onClick={send} className="min-h-10">
              <Send className="h-4 w-4" />
              {pending ? "Envoi..." : "Envoyer le pré-entretien"}
            </Button>
          </div>

          <PreviewQuestions positionRole={positionRole} allQuestions={questions} />
        </div>
      </Card>
    );
  }

  const expired = isPreInterviewExpired(preInterview);
  const progress = preInterviewProgress(questions, responses);
  const visibleQuestions = questions.filter(
    (q) => q.position_role === "all" || q.position_role === preInterview.position_role,
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold-dark" />
                Pré-entretien — {labelForRole(preInterview.position_role)}
              </h3>
              <div className="text-xs text-ink-3 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span>Envoyé le {formatDateTime(preInterview.sent_at ?? preInterview.created_at)}</span>
                {preInterview.expires_at ? (
                  <span>
                    Expire le {formatDateTime(preInterview.expires_at)}
                    {expired ? " (échu)" : ""}
                  </span>
                ) : null}
                {preInterview.completed_at ? (
                  <span>Complété le {formatDateTime(preInterview.completed_at)}</span>
                ) : null}
              </div>
            </div>
            <StatusBadge status={preInterview.status} expired={expired} />
          </div>

          {publicUrl ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 bg-surface-2 rounded-md p-2 text-[11px]">
                <code className="flex-1 break-all font-mono">{publicUrl}</code>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" /> Copier
                </Button>
                {preInterview.status === "sent" || preInterview.status === "started" ? (
                  <Button size="sm" variant="ghost" onClick={discard} disabled={pending}>
                    Annuler
                  </Button>
                ) : null}
              </div>
              {candidateEmail ? (
                <Button
                  size="sm"
                  variant="gold"
                  onClick={sendByEmail}
                  disabled={emailSending}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {emailSending
                    ? "Envoi en cours…"
                    : `Envoyer par email à ${candidateEmail}`}
                </Button>
              ) : (
                <p className="text-[11px] text-ink-3 italic">
                  Pas d'email candidat. Copie le lien et envoie-le par WhatsApp / SMS.
                </p>
              )}
            </div>
          ) : null}

          {preInterview.status !== "completed" ? (
            <div className="text-xs text-ink-2 bg-surface-2 rounded-md p-3">
              <Hourglass className="h-3.5 w-3.5 inline-block mr-1 text-warn" />
              En attente des réponses du candidat. Progression :{" "}
              <b>
                {progress.answered}/{progress.total}
              </b>{" "}
              ({progress.pct}%)
            </div>
          ) : null}
        </div>
      </Card>

      {preInterview.status === "completed" ? (
        <ReviewCard
          questions={visibleQuestions}
          responses={responses}
          decision={preInterview.decision}
          decisionNote={preInterview.decision_note}
          decisionNoteState={decisionNote}
          setDecisionNoteState={setDecisionNote}
          onDecide={decide}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status, expired }: { status: string; expired: boolean }) {
  if (expired && (status === "sent" || status === "started")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-danger-light text-danger">
        <XCircle className="h-3 w-3" /> Expiré
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-success-light text-success">
        <CheckCircle2 className="h-3 w-3" /> Complété
      </span>
    );
  }
  if (status === "started") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-warn-light text-warn">
        <Clock className="h-3 w-3" /> Démarré
      </span>
    );
  }
  if (status === "discarded") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-surface-2 text-ink-3">
        Annulé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase bg-info-light text-info">
      <Send className="h-3 w-3" /> Envoyé
    </span>
  );
}

function PreviewQuestions({
  positionRole,
  allQuestions,
}: {
  positionRole: string;
  allQuestions: PreInterviewQuestion[];
}) {
  const visible = allQuestions.filter(
    (q) => q.position_role === "all" || q.position_role === positionRole,
  );
  if (visible.length === 0) {
    return (
      <p className="text-xs text-ink-3 italic">
        Aucune question active. Allez dans /admin/pre-interview/questions pour en ajouter.
      </p>
    );
  }
  return (
    <div className="bg-surface-2 rounded-md p-3 text-xs space-y-2">
      <div className="flex items-center gap-1.5 font-bold text-ink-2">
        <FileText className="h-3.5 w-3.5" />
        Questions qui seront posées ({visible.length})
      </div>
      <ol className="space-y-1.5 list-decimal list-inside">
        {visible.map((q) => (
          <li key={q.id} className="leading-relaxed">
            <span className={q.position_role !== "all" ? "text-gold-dark font-semibold" : ""}>
              {q.prompt}
            </span>
            {q.position_role !== "all" ? (
              <span className="ml-1 text-[10px] text-ink-3">[{q.position_role}]</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReviewCard({
  questions,
  responses,
  decision,
  decisionNote,
  decisionNoteState,
  setDecisionNoteState,
  onDecide,
  pending,
}: {
  questions: PreInterviewQuestion[];
  responses: PreInterviewResponse[];
  decision: string | null;
  decisionNote: string | null;
  decisionNoteState: string;
  setDecisionNoteState: (v: string) => void;
  onDecide: (d: PreInterviewDecision) => void;
  pending: boolean;
}) {
  const byQuestion = new Map(responses.map((r) => [r.question_id, r]));
  return (
    <Card>
      <div className="p-4 space-y-4">
        <h3 className="font-bold text-sm">Réponses du candidat</h3>
        <ol className="space-y-3">
          {questions.map((q, idx) => {
            const r = byQuestion.get(q.id);
            return (
              <li key={q.id} className="border-l-2 border-gold-light pl-3">
                <div className="text-xs font-bold text-ink-2">
                  {idx + 1}. {q.prompt}
                </div>
                <div className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">
                  {renderAnswer(q, r)}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-line pt-4 space-y-3">
          <div>
            <h4 className="font-bold text-sm">Décision</h4>
            {decision ? (
              <p className="text-xs text-ink-3 mt-1">
                Déjà décidée : <b>{decision}</b>
                {decisionNote ? <> — « {decisionNote} »</> : null}
              </p>
            ) : (
              <p className="text-xs text-ink-3 mt-1">
                Choisissez la suite. Une fois shortlist, le candidat passe en{" "}
                <b>shortlistable</b> — utilisez ensuite le bouton « Demander des créneaux IA »
                pour la convocation physique.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="pi-note">Note (optionnel)</Label>
            <Textarea
              id="pi-note"
              rows={2}
              value={decisionNoteState}
              onChange={(e) => setDecisionNoteState(e.target.value)}
              placeholder="Pourquoi cette décision (facultatif)"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="success" disabled={pending} onClick={() => onDecide("shortlist")}>
              <CheckCircle2 className="h-4 w-4" /> Shortlist
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => onDecide("reserve")}>
              <Clock className="h-4 w-4" /> Mettre en réserve
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => onDecide("reject")}>
              <XCircle className="h-4 w-4" /> Refuser
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function renderAnswer(q: PreInterviewQuestion, r: PreInterviewResponse | undefined) {
  if (!r) return <span className="text-ink-3 italic">— Pas répondu —</span>;
  if (q.kind === "text") {
    return r.answer_text?.trim() ? r.answer_text : <span className="text-ink-3 italic">— Vide —</span>;
  }
  if (q.kind === "scale_1_5") {
    return r.answer_scale ? `${r.answer_scale} / 5` : <span className="text-ink-3 italic">— Vide —</span>;
  }
  if (q.kind === "single_choice" || q.kind === "multi_choice") {
    const arr = Array.isArray(r.answer_choices) ? r.answer_choices : [];
    if (arr.length === 0) return <span className="text-ink-3 italic">— Vide —</span>;
    const labels = arr.map((v) => {
      const c = q.choices?.find((x) => x.value === v);
      return c?.label ?? v;
    });
    return labels.join(", ");
  }
  if (q.kind === "video") {
    if (r.video_storage_path) {
      return (
        <VideoResponseView
          storagePath={r.video_storage_path}
          durationSec={r.video_duration_sec ?? null}
          purgeAfter={r.video_purge_after ?? null}
        />
      );
    }
    // Fallback texte (browser sans MediaRecorder)
    if (r.answer_text?.trim()) {
      return (
        <div>
          <div className="text-[11px] text-ink-3 italic mb-1">
            Réponse texte (appareil sans caméra)
          </div>
          <div className="whitespace-pre-wrap">{r.answer_text}</div>
        </div>
      );
    }
    return <span className="text-ink-3 italic">— Pas répondu —</span>;
  }
  return <span className="text-ink-3 italic">—</span>;
}

function VideoResponseView({
  storagePath,
  durationSec,
  purgeAfter,
}: {
  storagePath: string;
  durationSec: number | null;
  purgeAfter: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await getPreInterviewVideoSignedUrlAction({ storagePath });
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setUrl(res.url);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  async function download() {
    setDownloading(true);
    try {
      const res = await getPreInterviewVideoSignedUrlAction({
        storagePath,
        download: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Ouvre dans un nouvel onglet — le content-disposition force le download.
      window.open(res.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-xs text-ink-3 flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Génération du lien sécurisé…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs text-danger flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5" />
        Vidéo indisponible : {error}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <VideoIcon className="h-3.5 w-3.5 text-gold-dark" />
        Vidéo candidat
        {durationSec ? <span>· {durationSec} sec</span> : null}
        {purgeAfter ? (
          <span className="ml-auto">
            Purge programmée le {new Date(purgeAfter).toLocaleDateString("fr-BE")}
          </span>
        ) : null}
      </div>
      {url ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="w-full max-w-md rounded-md border border-line bg-ink"
        />
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={download}
        disabled={downloading}
      >
        <Download className="h-3.5 w-3.5" />
        {downloading ? "..." : "Télécharger la vidéo"}
      </Button>
    </div>
  );
}

function labelForRole(role: string): string {
  return POSITION_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}
