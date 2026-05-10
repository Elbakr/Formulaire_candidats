"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Flame,
  ChevronLeft,
  Ban,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  previewSitePlanAction,
  commitSitePlanAction,
  proposeOvertimeCandidatesAction,
  commitIndividualOvertimeAction,
  type SitePlanPreview,
  type UncoveredSlotWithCandidates,
  type OvertimeCandidate,
} from "./actions";

type DraftRow = SitePlanPreview["drafts"][number];

// Choix par cellule (need_id|employee_id) → multiplier ou 'no' (pas autorisé).
type AuthChoice = "no" | 1.25 | 1.5 | 2.0;

const MULT_OPTIONS: Array<1.25 | 1.5 | 2.0> = [1.25, 1.5, 2.0];

// Étape de l'UI : preview phase 1 → vue case-par-case → retour si annule.
type View = "preview" | "case_by_case";

export function GenerateSitePlanButton({
  siteCode,
  weekISO,
}: {
  siteCode: string;
  weekISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("preview");
  // Phase 1 : contractuel strict.
  const [basePreview, setBasePreview] = useState<SitePlanPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 2 case-par-case : slots avec candidats + choix de Karim par cellule.
  const [slots, setSlots] = useState<UncoveredSlotWithCandidates[] | null>(null);
  // key = `${need_id}|${date}|${employee_id}` → AuthChoice. Default = 'no'.
  const [choices, setChoices] = useState<Record<string, AuthChoice>>({});

  function generate() {
    setBasePreview(null);
    setError(null);
    setSlots(null);
    setChoices({});
    setView("preview");
    setOpen(true);
    startTransition(async () => {
      const r = await previewSitePlanAction(siteCode, weekISO);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setBasePreview(r);
    });
  }

  function openCaseByCase() {
    if (!basePreview) return;
    startTransition(async () => {
      const r = await proposeOvertimeCandidatesAction({
        siteCode,
        weekISO,
        baseDrafts: basePreview.drafts,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setSlots(r.slots);
      setChoices({});
      setView("case_by_case");
    });
  }

  function setChoice(key: string, value: AuthChoice) {
    setChoices((prev) => ({ ...prev, [key]: value }));
  }

  function commitContractual() {
    if (!basePreview) return;
    startTransition(async () => {
      const r = await commitSitePlanAction(basePreview.drafts);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.created ?? 0} shifts créés.`);
      closeAll();
      router.refresh();
    });
  }

  function closeAll() {
    setOpen(false);
    setBasePreview(null);
    setSlots(null);
    setChoices({});
    setError(null);
    setView("preview");
  }

  // Récapitulatif des autorisations sélectionnées (pour le résumé en haut + commit).
  const authorizations = useMemo(() => {
    if (!slots) return [] as Array<{
      need_id: string;
      employee_id: string;
      employee_name: string;
      start_time: string;
      end_time: string;
      overtime_multiplier: 1.25 | 1.5 | 2.0;
      hours: number;
      ot_hours: number;
    }>;
    const out: Array<{
      need_id: string;
      employee_id: string;
      employee_name: string;
      start_time: string;
      end_time: string;
      overtime_multiplier: 1.25 | 1.5 | 2.0;
      hours: number;
      ot_hours: number;
    }> = [];
    for (const slot of slots) {
      // Compte combien de personnes ont déjà été choisies pour ce slot pour
      // pas en ajouter plus que `missing` (dépassement = warning UI plus bas).
      let chosenCount = 0;
      for (const c of slot.candidates) {
        const key = `${slot.need_id}|${slot.date}|${c.employee_id}`;
        const v = choices[key];
        if (v && v !== "no") {
          if (chosenCount >= slot.missing) continue; // skip surplus
          chosenCount += 1;
          out.push({
            need_id: slot.need_id,
            employee_id: c.employee_id,
            employee_name: c.employee_name,
            start_time: c.effective_start_time,
            end_time: c.effective_end_time,
            overtime_multiplier: v as 1.25 | 1.5 | 2.0,
            hours: c.effective_slot_hours,
            ot_hours: c.overtime_hours,
          });
        }
      }
    }
    return out;
  }, [slots, choices]);

  function commitOvertime() {
    if (authorizations.length === 0) {
      toast.warning("Aucune autorisation sélectionnée.");
      return;
    }
    startTransition(async () => {
      const r = await commitIndividualOvertimeAction({
        siteCode,
        weekISO,
        authorizations: authorizations.map((a) => ({
          need_id: a.need_id,
          employee_id: a.employee_id,
          start_time: a.start_time,
          end_time: a.end_time,
          overtime_multiplier: a.overtime_multiplier,
        })),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.created ?? 0} heure${(r.created ?? 0) > 1 ? "s" : ""} sup. autorisée${(r.created ?? 0) > 1 ? "s" : ""}.`,
      );
      // On commit aussi les contractuels phase 1 si pas déjà fait. Comme la
      // phase OT vient APRÈS la phase 1 dans le flow Karim, on les commit
      // maintenant ensemble pour ne pas oublier.
      if (basePreview && basePreview.drafts.length > 0) {
        const c = await commitSitePlanAction(basePreview.drafts);
        if (c.error) {
          toast.error(`Erreur commit phase 1 : ${c.error}`);
          return;
        }
        toast.success(`${c.created ?? 0} shift${(c.created ?? 0) > 1 ? "s" : ""} contractuel${(c.created ?? 0) > 1 ? "s" : ""} créé${(c.created ?? 0) > 1 ? "s" : ""}.`);
      }
      closeAll();
      router.refresh();
    });
  }

  // -------- Données dérivées pour la vue preview ------------------------
  const contractualDrafts: DraftRow[] = (basePreview?.drafts ?? []).filter(
    (d) => !d.is_overtime,
  );
  const uncovered = basePreview?.uncovered ?? [];

  return (
    <>
      <Button onClick={generate} variant="gold" size="sm" disabled={pending}>
        <Sparkles className="h-3.5 w-3.5" /> Générer le planning
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeAll())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {view === "case_by_case"
                ? `Heures sup. case-par-case — Site ${siteCode}`
                : `Génération du planning — Site ${siteCode}`}
            </DialogTitle>
            <DialogDescription>
              {view === "case_by_case"
                ? "Pour chaque créneau non couvert, choisis quel employé autoriser et à quel niveau (×1.25 / ×1.5 / ×2). Pas de choix = pas de shift créé."
                : "Phase 1 : contractuel strict (jamais > weekly_hours). Phase 2 : autorisations d'heures sup case-par-case."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {pending && !basePreview && !error && view === "preview" ? (
              <div className="text-center py-6 text-sm text-ink-2">
                Calcul en cours…
              </div>
            ) : null}

            {error ? (
              <Card className="border-danger">
                <div className="p-4 flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                  <div className="text-sm text-danger">{error}</div>
                </div>
              </Card>
            ) : null}

            {view === "preview" && basePreview ? (
              <PreviewContent
                preview={basePreview}
                contractualDrafts={contractualDrafts}
                uncovered={uncovered}
                onOpenCaseByCase={openCaseByCase}
                pending={pending}
              />
            ) : null}

            {view === "case_by_case" && slots ? (
              <CaseByCaseContent
                slots={slots}
                choices={choices}
                setChoice={setChoice}
                authorizations={authorizations}
                onBack={() => setView("preview")}
                pending={pending}
              />
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAll} disabled={pending}>
              Annuler
            </Button>

            {view === "preview" && basePreview && basePreview.drafts.length > 0 ? (
              <Button onClick={commitContractual} disabled={pending} variant="gold">
                {pending
                  ? "Création…"
                  : `Valider phase 1 (${basePreview.drafts.length} shifts)`}
              </Button>
            ) : null}

            {view === "case_by_case" ? (
              <Button
                onClick={commitOvertime}
                disabled={pending || authorizations.length === 0}
                variant="gold"
              >
                {pending
                  ? "Validation…"
                  : `Valider ${authorizations.length} autorisation${authorizations.length > 1 ? "s" : ""}`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vue preview = phase 1 contractuel + bandeau "Voir les options" si uncovered
// ---------------------------------------------------------------------------

function PreviewContent({
  preview,
  contractualDrafts,
  uncovered,
  onOpenCaseByCase,
  pending,
}: {
  preview: SitePlanPreview;
  contractualDrafts: DraftRow[];
  uncovered: SitePlanPreview["uncovered"];
  onOpenCaseByCase: () => void;
  pending: boolean;
}) {
  const totalMissing = uncovered.reduce((acc, u) => acc + u.missing, 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat
          label="Shifts à créer"
          value={preview.drafts.length}
          tone="success"
        />
        <Stat
          label="Créneaux non couverts"
          value={totalMissing}
          tone={uncovered.length > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Période"
          value={`${preview.weekStart.slice(5)} → ${preview.weekEnd.slice(5)}`}
          tone="neutral"
        />
      </div>

      {/* Bandeau case-par-case : visible dès qu'il y a un créneau non couvert. */}
      {uncovered.length > 0 ? (
        <div className="rounded-md border-2 border-orange-300 bg-orange-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-orange-700 font-bold text-sm">
            <Flame className="h-4 w-4" />
            <span>
              {totalMissing} créneau{totalMissing > 1 ? "x" : ""} non couvert
              {totalMissing > 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-xs text-orange-700/90">
            Veux-tu autoriser des heures supplémentaires au cas par cas ? Tu
            verras la liste des candidats triés par tier + heures déjà faites,
            et tu choisis pour chacun.
          </p>
          <div>
            <Button
              size="sm"
              variant="gold"
              disabled={pending}
              onClick={onOpenCaseByCase}
            >
              <Users className="h-3.5 w-3.5" /> Voir les options
            </Button>
          </div>
        </div>
      ) : null}

      {contractualDrafts.length > 0 ? (
        <div className="border border-line rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-success-light text-success text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Shifts contractuels ({contractualDrafts.length})
            </span>
            {contractualDrafts.some((d) => d.is_renfort) ? (
              <span className="text-[10px] text-info bg-info-light px-1.5 py-0.5 rounded normal-case font-bold">
                {contractualDrafts.filter((d) => d.is_renfort).length} renfort
                {contractualDrafts.filter((d) => d.is_renfort).length > 1
                  ? "s"
                  : ""}
                &nbsp;cross-site
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-line max-h-[260px] overflow-y-auto text-xs">
            {contractualDrafts.map((d, i) => (
              <li
                key={`c-${i}`}
                className={`px-3 py-1.5 flex items-center gap-2 ${
                  d.is_renfort ? "bg-info-light/40" : ""
                }`}
              >
                <span className="font-mono text-ink-3 w-20 shrink-0">
                  {d.date.slice(5)}
                </span>
                <span className="font-mono text-ink-3 w-24 shrink-0">
                  {d.start_time}–{d.end_time}
                </span>
                <span className="font-bold flex-1 truncate">
                  {d.employee_name}
                </span>
                {d.is_renfort ? (
                  <span
                    title="Employé non rattaché à ce site — renfort"
                    className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-info text-white"
                  >
                    Renfort
                  </span>
                ) : d.pool_tier === 2 ? (
                  <span
                    title="Site secondaire pour cet employé"
                    className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-gold-light text-gold-dark"
                  >
                    2nd
                  </span>
                ) : null}
                {d.position ? (
                  <span className="text-[10px] text-ink-3">{d.position}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {uncovered.length > 0 ? (
        <div className="border border-warn rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-warn-light text-warn text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Sous-effectif ({uncovered.length})
          </div>
          <ul className="divide-y divide-line max-h-[160px] overflow-y-auto text-xs">
            {uncovered.map((u, i) => (
              <li key={i} className="px-3 py-1.5 flex items-center gap-2">
                <span className="font-mono w-20 shrink-0">{u.day_label}</span>
                <span className="font-mono w-20 shrink-0">
                  {u.date.slice(5)}
                </span>
                <span className="font-mono w-24 shrink-0">
                  {u.start_time}–{u.end_time}
                </span>
                <span className="text-warn font-bold ml-auto">
                  il manque {u.missing}
                </span>
                <span
                  className="text-[9px] text-ink-3 uppercase tracking-wider"
                  title={u.reason}
                >
                  {labelForReason(u.reason)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.contract_usage.length > 0 ? (
        <details className="text-xs border border-line rounded-md">
          <summary className="px-3 py-2 bg-surface-2 cursor-pointer font-bold text-ink-2 uppercase tracking-wider text-[11px]">
            Utilisation contractuelle ({preview.contract_usage.length} employé
            {preview.contract_usage.length > 1 ? "s" : ""})
          </summary>
          <ul className="divide-y divide-line max-h-[180px] overflow-y-auto">
            {preview.contract_usage.map((u) => {
              const pct = Math.round(
                (u.used_hours_total_week / Math.max(1, u.weekly_hours)) * 100,
              );
              const tone =
                pct > 100
                  ? "text-orange-700"
                  : pct >= 90
                    ? "text-success"
                    : "text-ink-2";
              return (
                <li
                  key={u.employee_id}
                  className="px-3 py-1.5 flex items-center gap-2"
                >
                  <span className="font-bold flex-1 truncate">
                    {u.employee_name}
                  </span>
                  <span className="font-mono text-ink-3">
                    {u.used_hours_total_week.toFixed(1)}h / {u.weekly_hours}h
                  </span>
                  <span className={`font-mono font-bold ${tone}`}>{pct}%</span>
                  <span className="text-[10px] text-ink-3">
                    {u.days_planned}j
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Vue case-par-case
// ---------------------------------------------------------------------------

function CaseByCaseContent({
  slots,
  choices,
  setChoice,
  authorizations,
  onBack,
  pending,
}: {
  slots: UncoveredSlotWithCandidates[];
  choices: Record<string, "no" | 1.25 | 1.5 | 2.0>;
  setChoice: (key: string, value: "no" | 1.25 | 1.5 | 2.0) => void;
  authorizations: Array<{
    need_id: string;
    employee_id: string;
    employee_name: string;
    start_time: string;
    end_time: string;
    overtime_multiplier: 1.25 | 1.5 | 2.0;
    hours: number;
    ot_hours: number;
  }>;
  onBack: () => void;
  pending: boolean;
}) {
  const totalShifts = authorizations.length;
  const totalOtHours = authorizations.reduce((acc, a) => acc + a.ot_hours, 0);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          disabled={pending}
          className="text-ink-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Retour à la phase 1
        </Button>
        <div className="text-xs text-ink-2 text-right">
          <div>
            <span className="font-bold text-ink-1">{totalShifts}</span> shift
            {totalShifts > 1 ? "s" : ""} OT à créer
          </div>
          <div>
            Heures sup. totales :{" "}
            <span className="font-bold text-orange-700">
              {totalOtHours.toFixed(1)} h
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {slots.length === 0 ? (
          <div className="text-center py-6 text-sm text-ink-2">
            Aucun créneau non couvert. La phase 1 a tout absorbé.
          </div>
        ) : null}

        {slots.map((slot) => (
          <SlotCard
            key={`${slot.need_id}|${slot.date}`}
            slot={slot}
            choices={choices}
            setChoice={setChoice}
            disabled={pending}
          />
        ))}
      </div>
    </>
  );
}

function SlotCard({
  slot,
  choices,
  setChoice,
  disabled,
}: {
  slot: UncoveredSlotWithCandidates;
  choices: Record<string, "no" | 1.25 | 1.5 | 2.0>;
  setChoice: (key: string, value: "no" | 1.25 | 1.5 | 2.0) => void;
  disabled: boolean;
}) {
  // Compte les choix actifs sur ce slot pour signaler le surplus.
  let active = 0;
  for (const c of slot.candidates) {
    const key = `${slot.need_id}|${slot.date}|${c.employee_id}`;
    if (choices[key] && choices[key] !== "no") active += 1;
  }
  const surplus = active > slot.missing;

  return (
    <Card>
      <div className="border-b border-line px-3 py-2 bg-surface-2 flex flex-wrap items-center gap-2">
        <span className="font-bold text-sm">{slot.day_label}</span>
        <span className="font-mono text-sm text-ink-2">
          {slot.date.slice(5)}
        </span>
        <span className="font-mono text-sm">
          {slot.start_time}–{slot.end_time}
        </span>
        <span className="font-mono text-xs text-ink-3">
          {slot.duration_hours.toFixed(2)}h
        </span>
        {slot.role ? (
          <span className="text-[10px] text-ink-3 uppercase tracking-wider">
            {slot.role}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-warn font-bold uppercase tracking-wider">
          Manque {slot.missing} pers.
        </span>
      </div>

      {surplus ? (
        <div className="px-3 py-1.5 bg-warn-light text-warn text-[11px]">
          Tu as autorisé {active} personnes mais le créneau n&apos;en a besoin
          que de {slot.missing}. Les autorisations en surplus seront ignorées.
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {slot.candidates.map((c) => (
          <CandidateRow
            key={c.employee_id}
            slot={slot}
            candidate={c}
            choice={
              choices[`${slot.need_id}|${slot.date}|${c.employee_id}`] ?? "no"
            }
            onChoose={(v) =>
              setChoice(
                `${slot.need_id}|${slot.date}|${c.employee_id}`,
                v,
              )
            }
            disabled={disabled}
          />
        ))}
      </ul>
    </Card>
  );
}

function CandidateRow({
  slot: _slot,
  candidate,
  choice,
  onChoose,
  disabled,
}: {
  slot: UncoveredSlotWithCandidates;
  candidate: OvertimeCandidate;
  choice: "no" | 1.25 | 1.5 | 2.0;
  onChoose: (v: "no" | 1.25 | 1.5 | 2.0) => void;
  disabled: boolean;
}) {
  const tierLabel =
    candidate.pool_tier === 1
      ? "Primary"
      : candidate.pool_tier === 2
        ? "Secondary"
        : "External";
  const tierClass =
    candidate.pool_tier === 1
      ? "bg-success-light text-success"
      : candidate.pool_tier === 2
        ? "bg-gold-light text-gold-dark"
        : "bg-info-light text-info";

  const unavailable = !candidate.available_for_this_slot;

  // Quels multipliers proposer ? Tous ceux >= min_multiplier_required.
  // Si min = null (pas de dépassement), tous sont visibles mais le shift n'est
  // pas réellement OT — on bloque proprement (rare en pratique).
  const minMult = candidate.min_multiplier_required;
  const allowedMults = MULT_OPTIONS.filter((m) =>
    minMult === null ? true : m >= minMult,
  );

  return (
    <li
      className={`px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 text-xs ${
        unavailable ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 sm:flex-1">
        <span className="font-bold truncate">{candidate.employee_name}</span>
        <span
          className={`text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded shrink-0 ${tierClass}`}
        >
          {tierLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 text-ink-2 sm:flex-1">
        <span className="font-mono whitespace-nowrap">
          {candidate.current_planned_hours.toFixed(1)} /{" "}
          {candidate.weekly_hours_target}h
        </span>
        {unavailable ? (
          <span className="text-[10px] text-danger uppercase tracking-wider whitespace-nowrap">
            <Ban className="h-3 w-3 inline mr-1" />
            {labelForUnavailable(candidate.reason_unavailable)}
          </span>
        ) : (
          <span className="text-[10px] text-ink-3 whitespace-nowrap">
            → {candidate.would_be_total_hours.toFixed(1)}h
            {candidate.overtime_hours > 0 ? (
              <span className="text-orange-700 font-bold">
                {" "}
                (+{candidate.overtime_hours.toFixed(1)}h sup)
              </span>
            ) : null}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:justify-end shrink-0">
        <ChoiceButton
          label="Refuser"
          active={choice === "no"}
          onClick={() => onChoose("no")}
          disabled={disabled}
          tone="neutral"
        />
        {allowedMults.map((m) => (
          <ChoiceButton
            key={m}
            label={`×${m}`}
            active={choice === m}
            onClick={() => onChoose(m)}
            disabled={disabled || unavailable}
            tone="orange"
            title={`Autoriser jusqu'à ×${m} (max ${(candidate.weekly_hours_target * m).toFixed(0)}h)`}
          />
        ))}
      </div>
    </li>
  );
}

function ChoiceButton({
  label,
  active,
  onClick,
  disabled,
  tone,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  tone: "neutral" | "orange";
  title?: string;
}) {
  // Pas de classes Tailwind concaténées dynamiques : on liste explicitement.
  let cls =
    "h-7 px-2 rounded-[var(--radius-sm)] border text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  if (active) {
    cls +=
      tone === "orange"
        ? " bg-orange-500 border-orange-500 text-white"
        : " bg-ink-2 border-ink-2 text-white";
  } else {
    cls +=
      tone === "orange"
        ? " border-orange-300 text-orange-700 hover:bg-orange-100"
        : " border-line text-ink-2 hover:bg-surface-2";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cls}
      title={title}
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "warn" | "neutral";
}) {
  const cls =
    tone === "success"
      ? "bg-success-light text-success"
      : tone === "warn"
        ? "bg-warn-light text-warn"
        : "bg-surface-2 text-ink-2";
  return (
    <div className={`rounded-md p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">
        {label}
      </div>
      <div className="font-bold text-base">{value}</div>
    </div>
  );
}

function labelForReason(reason: string): string {
  switch (reason) {
    case "no_hours_left":
    case "hours_capped":
      return "h. contract. épuisées";
    case "all_off":
      return "tous off / congés";
    case "all_busy":
      return "tous occupés";
    case "no_hours_left_overtime":
      return "h. sup. plafonnées";
    case "no_one_available":
      return "personne dispo";
    case "not_enough_staff":
      return "effectif insuffisant";
    default:
      return reason;
  }
}

function labelForUnavailable(reason?: string): string {
  switch (reason) {
    case "conflict":
      return "Conflit horaire";
    case "in_off":
    case "off_day":
      return "Off ce jour";
    case "in_leave":
      return "En congé";
    case "in_unavail":
      return "Indispo déclarée";
    default:
      return "Indisponible";
  }
}
