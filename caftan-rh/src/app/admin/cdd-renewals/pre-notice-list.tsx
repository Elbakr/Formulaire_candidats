"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendPreNoticeAction } from "./prenotice-actions";

export type PreNoticeRow = {
  id: string;
  full_name: string;
  contract_type: string | null;
  contract_end_date: string;
  days_remaining: number;
  sent_at: string | null;
  responded_at: string | null;
  wants_renewal: boolean | null;
  available_from: string | null;
  available_to: string | null;
  reason: string | null;
  appreciation: string | null;
};

export function PreNoticeList({ rows }: { rows: PreNoticeRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-ink-3">
        Aucun pré-avis en cours. Le scan en prépare 15 jours avant chaque fin de contrat (CDD &amp; Étudiant).
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <PreNoticeItem key={r.id} row={r} />
      ))}
    </ul>
  );
}

function PreNoticeItem({ row }: { row: PreNoticeRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const r = await sendPreNoticeAction(row.id);
      if (r.ok) {
        toast.success(`Pré-avis envoyé à ${row.full_name}`);
        router.refresh();
      } else {
        toast.error(r.error ?? "Échec de l'envoi");
      }
    });
  }

  const responded = !!row.responded_at;
  return (
    <li className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-ink">{row.full_name}</span>
          <span className="text-[10px] uppercase font-bold tracking-wide text-ink-3">{row.contract_type ?? "Contrat"}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.days_remaining <= 7 ? "bg-danger-light text-danger" : "bg-warn-light text-warn"}`}>
            J-{Math.max(0, row.days_remaining)}
          </span>
        </div>
        <div className="text-xs text-ink-3 mt-0.5">Fin du contrat : {row.contract_end_date}</div>

        {responded ? (
          <div className="mt-2 rounded-lg bg-surface-2 p-2.5 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              {row.wants_renewal ? (
                <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /> Souhaite être renouvelé·e</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-danger"><X className="h-3.5 w-3.5" /> Ne souhaite pas</span>
              )}
            </div>
            {row.wants_renewal && (row.available_from || row.available_to) ? (
              <div className="text-ink-2">Dispo : {row.available_from ?? "?"} {row.available_to ? `→ ${row.available_to}` : ""}</div>
            ) : null}
            {row.reason ? <div className="text-ink-2"><b>Raison :</b> {row.reason}</div> : null}
            {row.appreciation ? <div className="text-ink-2"><b>Appréciation :</b> {row.appreciation}</div> : null}
          </div>
        ) : row.sent_at ? (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-info font-semibold">
            <Clock className="h-3.5 w-3.5" /> Envoyé · en attente de réponse
          </div>
        ) : null}
      </div>

      {!responded ? (
        <Button
          variant={row.sent_at ? "outline" : "gold"}
          size="sm"
          onClick={send}
          disabled={pending}
          className="shrink-0 self-end sm:self-auto"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          {row.sent_at ? "Renvoyer" : "Envoyer le pré-avis"}
        </Button>
      ) : null}
    </li>
  );
}
