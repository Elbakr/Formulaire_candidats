"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
  MessageCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  updateRationaleAction,
  sendRenewalProposalAction,
  discussRenewalAction,
  rejectRenewalAction,
  rerunRecommendationAction,
} from "./actions";

type Trend = "+" | "=" | "-";

export type RenewalCardProps = {
  recommendationId: string;
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  contractEndDate: string;
  daysRemaining: number;
  recommendation: "renew" | "do_not_renew" | "discuss";
  status: "pending" | "sent" | "discussing" | "rejected_by_admin" | "archived";
  globalScore: number | null;
  rationale: string;
  trends: {
    ponctualite_30d: Trend;
    fiabilite_30d: Trend;
    rating_30d: Trend;
    absences_30d: Trend;
  };
  siteLoadForecast: Record<string, "under_staffed" | "balanced" | "over_staffed">;
};

const RECO_BADGE: Record<RenewalCardProps["recommendation"], { label: string; cls: string }> = {
  renew: { label: "Renouveler", cls: "bg-success-light text-success" },
  do_not_renew: { label: "Ne pas renouveler", cls: "bg-danger-light text-danger" },
  discuss: { label: "Discuter", cls: "bg-warn-light text-warn" },
};

const STATUS_BADGE: Record<RenewalCardProps["status"], { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-info-light text-info" },
  sent: { label: "Proposition envoyée", cls: "bg-success-light text-success" },
  discussing: { label: "En discussion", cls: "bg-warn-light text-warn" },
  rejected_by_admin: { label: "Non-renouvellement acté", cls: "bg-danger-light text-danger" },
  archived: { label: "Archivé", cls: "bg-surface-2 text-ink-3" },
};

const TREND_LABELS: Record<keyof RenewalCardProps["trends"], string> = {
  ponctualite_30d: "Ponctualité",
  fiabilite_30d: "Fiabilité",
  rating_30d: "Note hebdo",
  absences_30d: "Absences",
};

const SITE_LOAD_LABEL: Record<RenewalCardProps["siteLoadForecast"][string], string> = {
  under_staffed: "sous-staffé",
  balanced: "équilibré",
  over_staffed: "sur-staffé",
};
const SITE_LOAD_CLS: Record<RenewalCardProps["siteLoadForecast"][string], string> = {
  under_staffed: "bg-danger-light text-danger",
  balanced: "bg-info-light text-info",
  over_staffed: "bg-warn-light text-warn",
};

function TrendIcon({ t }: { t: Trend }) {
  if (t === "+") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
  if (t === "-") return <TrendingDown className="h-3.5 w-3.5 text-danger" />;
  return <Minus className="h-3.5 w-3.5 text-ink-3" />;
}

export function RenewalCard(props: RenewalCardProps) {
  const [rationale, setRationale] = useState(props.rationale);
  const [pending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");

  const isLocked = props.status !== "pending";
  const recoBadge = RECO_BADGE[props.recommendation];
  const statusBadge = STATUS_BADGE[props.status];

  function persistRationale() {
    startTransition(async () => {
      const r = await updateRationaleAction({
        recommendationId: props.recommendationId,
        rationale,
      });
      if (r?.error) toast.error(r.error);
      else toast.success("Justification enregistrée.");
    });
  }

  function send() {
    startTransition(async () => {
      const r = await sendRenewalProposalAction({ recommendationId: props.recommendationId });
      if (r?.error) toast.error(r.error);
      else toast.success("Proposition envoyée. Manager + employé notifiés.");
    });
  }

  function discuss() {
    startTransition(async () => {
      const r = await discussRenewalAction({ recommendationId: props.recommendationId });
      if (r?.error) toast.error(r.error);
      else toast.success("Manager invité à discuter.");
    });
  }

  function rejectFinal() {
    startTransition(async () => {
      const r = await rejectRenewalAction({
        recommendationId: props.recommendationId,
        decisionNote,
      });
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Non-renouvellement acté.");
        setShowReject(false);
      }
    });
  }

  function rerun() {
    startTransition(async () => {
      const r = await rerunRecommendationAction({
        employeeId: props.employeeId,
        contractEndDate: props.contractEndDate,
      });
      if (r?.error) toast.error(r.error);
      else toast.success("Fiche recalculée.");
    });
  }

  return (
    <div className="p-4 border-b border-line last:border-b-0">
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <NameAvatar name={props.fullName} className="h-10 w-10 text-sm rounded-lg shrink-0" />
        <div className="flex-1 min-w-[180px]">
          <Link
            href={`/scoring/${props.employeeId}`}
            className="font-bold text-sm hover:text-gold-dark"
          >
            {props.fullName}
          </Link>
          <div className="text-[11px] text-ink-3">{props.jobTitle ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
            Fin contrat
          </div>
          <div className="font-mono font-bold text-sm">{props.contractEndDate}</div>
          <div
            className={`text-[10px] font-bold ${
              props.daysRemaining <= 7 ? "text-danger" : props.daysRemaining <= 21 ? "text-warn" : "text-ink-3"
            }`}
          >
            J-{Math.max(0, props.daysRemaining)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${recoBadge.cls}`}>
          {recoBadge.label}
        </span>
        <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
        {props.globalScore != null ? (
          <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-gold-light text-gold-dark font-mono">
            Score {props.globalScore.toFixed(0)}/100
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {(Object.keys(props.trends) as Array<keyof RenewalCardProps["trends"]>).map((k) => (
          <div key={k} className="bg-surface-2 rounded-md p-2 flex items-center gap-2">
            <TrendIcon t={props.trends[k]} />
            <div className="text-[11px]">
              <div className="font-bold">{TREND_LABELS[k]}</div>
              <div className="text-ink-3">30j</div>
            </div>
          </div>
        ))}
      </div>

      {Object.keys(props.siteLoadForecast).length > 0 ? (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[10px] uppercase font-bold tracking-wider text-ink-3">
            Charge prévi 4 sem.
          </span>
          {Object.entries(props.siteLoadForecast).map(([code, load]) => (
            <span
              key={code}
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SITE_LOAD_CLS[load]}`}
            >
              {code} · {SITE_LOAD_LABEL[load]}
            </span>
          ))}
        </div>
      ) : null}

      <Textarea
        rows={4}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        onBlur={persistRationale}
        disabled={isLocked || pending}
        className="text-xs"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          type="button"
          variant="success"
          size="sm"
          onClick={send}
          disabled={isLocked || pending}
        >
          <Send className="h-3.5 w-3.5" /> Envoyer la proposition
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={discuss}
          disabled={(props.status !== "pending" && props.status !== "discussing") || pending}
        >
          <MessageCircle className="h-3.5 w-3.5" /> Discuter
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => setShowReject((v) => !v)}
          disabled={isLocked || pending}
        >
          <XCircle className="h-3.5 w-3.5" /> Marquer non-renouvellement
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={rerun}
          disabled={pending}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Recalculer
        </Button>
      </div>

      {showReject ? (
        <div className="mt-3 rounded-md border border-danger-light bg-danger-light/40 p-3">
          <div className="text-xs font-bold text-danger mb-2">
            Non-renouvellement — décision irréversible côté plateforme. Le courrier officiel
            doit toujours être contresigné par un humain.
          </div>
          <Textarea
            rows={3}
            placeholder="Justification (obligatoire)…"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            disabled={pending}
            className="text-xs"
          />
          <div className="flex gap-2 mt-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowReject(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={rejectFinal}
              disabled={pending || !decisionNote.trim()}
            >
              Confirmer le non-renouvellement
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
