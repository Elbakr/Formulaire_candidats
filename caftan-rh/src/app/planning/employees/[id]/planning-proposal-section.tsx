"use client";

// Karim 2026-07-09 : PROPOSITION DE PLANNING (Phase 1) — affichage lecture des 2
// variantes (3 semaines) + bouton (re)génération (date de début éditable) +
// modèles réutilisables (enregistrer / partir d'un modèle). AUCUN envoi
// travailleur. La SÉLECTION d'une variante par défaut = Phase 2 (TODO).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  CalendarClock,
  BookmarkPlus,
  Check,
  Tablet,
  Repeat,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  computeReinforcementSlots,
  type ReinforcementSlot,
} from "@/lib/scheduling/planning-proposal";
import {
  regeneratePlanningProposalAction,
  savePlanningTemplateAction,
  setDefaultPlanningVariantAction,
  activateReinforcementShiftAction,
} from "./planning-proposal-actions";
import { setWorkerAutoShiftAction, setWorkerAutoVariantAction } from "@/app/admin/auto-shift-actions";
import { Radio, Shuffle } from "lucide-react";

// ── Types (miroir du moteur lib/scheduling/planning-proposal.ts) ─────────────
type ProposalBreak = { start: string; end: string };
type ProposalShift = {
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  pause?: { start: string; end: string } | null;
  breaks?: ProposalBreak[];
};
type ProposalWeek = {
  week_index: number;
  week_start: string;
  week_end: string;
  shifts: ProposalShift[];
  total_hours: number;
};
type ProposalVariant = {
  label: "A" | "B" | "C";
  strategy: string;
  weeks: ProposalWeek[];
  total_hours: number;
};
export type CurrentProposal = {
  start_date: string;
  weeks: number;
  variant_a: ProposalVariant;
  variant_b: ProposalVariant;
  variant_c: ProposalVariant | null; // null pour les propositions d'avant variant_c
  selected_variant: "A" | "B" | "C" | null;
  reason: string | null;
  generated_at: string;
  generated_by: string | null;
  weekly_hours?: number | null;
  default_start_time?: string | null;
  default_shift_hours?: number | null;
} | null;

export type PlanningTemplateLite = { id: string; name: string };

const FR_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Lundi de la semaine d'une date ISO (semaine lun→dim). */
function mondayOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Défaut CENTRÉ : lundi de la semaine DERNIÈRE -> 3 semaines = passée/en cours/
 *  prochaine, avec aujourd'hui au milieu. */
function centeredStartISO(): string {
  return addDaysISO(mondayOfISO(todayISO()), -7);
}

function fmtDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${FR_DAYS[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function fmtLongDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function fmtGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function PlanningProposalSection({
  employeeId,
  proposal,
  templates,
  overtimeCapable,
  firstName,
  bookedDates,
  autoShift,
  autoVariant,
  tabletMode,
  tabletActiveVariant,
}: {
  employeeId: string;
  proposal: CurrentProposal;
  templates: PlanningTemplateLite[];
  /** `employees.ot_eligible` — apte/éligible aux heures supplémentaires (renfort). */
  overtimeCapable: boolean;
  firstName: string;
  /** Dates ("YYYY-MM-DD") où le travailleur a DÉJÀ un shift réel (exclues du renfort). */
  bookedDates: string[];
  /** `employees.auto_shift` — Auto-Shift individuel (tablette = planning réel). */
  autoShift: boolean;
  /** `employees.auto_variant` — Auto-Variant (tablette = variant du jour auto). */
  autoVariant: boolean;
  /** Mode réellement affiché sur la tablette AUJOURD'HUI (calculé serveur). */
  tabletMode: "auto_shift" | "auto_variant" | "variant";
  /** Variant réellement affiché (null en Auto-Shift). */
  tabletActiveVariant: "A" | "B" | "C" | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(proposal?.start_date ?? centeredStartISO());
  const [templateId, setTemplateId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<string>("none");
  const [pending, startTransition] = useTransition();

  // PHASE 2 : variante par défaut visible par le travailleur sur la tablette.
  // Défaut 'A' si rien n'a été coché (aligné sur la logique tablette).
  const [defaultVariant, setDefaultVariant] = useState<"A" | "B" | "C">(
    proposal?.selected_variant ?? "A",
  );
  const [savingDefault, startSaveDefault] = useTransition();

  // Modes d'affichage tablette (mutuellement exclusifs) : Auto-Shift (planning
  // réel) et Auto-Variant (variant du jour auto). Off/Off = variant coché.
  const [autoShiftOn, setAutoShiftOn] = useState(autoShift);
  const [autoVariantOn, setAutoVariantOn] = useState(autoVariant);
  const [savingAutoShift, startSaveAutoShift] = useTransition();
  const [savingAutoVariant, startSaveAutoVariant] = useTransition();

  function toggleAutoShift() {
    const next = !autoShiftOn;
    const prevShift = autoShiftOn;
    const prevVariant = autoVariantOn;
    setAutoShiftOn(next);
    if (next) setAutoVariantOn(false); // exclusif
    startSaveAutoShift(async () => {
      const r = await setWorkerAutoShiftAction(employeeId, next);
      if (r.error) {
        setAutoShiftOn(prevShift);
        setAutoVariantOn(prevVariant);
        toast.error(r.error);
        return;
      }
      toast.success(
        next
          ? "Auto-Shift activé : la tablette affiche le planning réel du jour."
          : "Auto-Shift désactivé : la tablette réaffiche le variant coché.",
      );
      router.refresh();
    });
  }

  function toggleAutoVariant() {
    const next = !autoVariantOn;
    const prevShift = autoShiftOn;
    const prevVariant = autoVariantOn;
    setAutoVariantOn(next);
    if (next) setAutoShiftOn(false); // exclusif
    startSaveAutoVariant(async () => {
      const r = await setWorkerAutoVariantAction(employeeId, next);
      if (r.error) {
        setAutoShiftOn(prevShift);
        setAutoVariantOn(prevVariant);
        toast.error(r.error);
        return;
      }
      toast.success(
        next
          ? "Auto-Variant activé : la tablette choisit le variant qui colle à aujourd'hui."
          : "Auto-Variant désactivé : la tablette réaffiche le variant coché.",
      );
      router.refresh();
    });
  }

  function onSelectDefault(variant: "A" | "B" | "C") {
    if (variant === defaultVariant) return;
    const prev = defaultVariant;
    setDefaultVariant(variant);
    startSaveDefault(async () => {
      const r = await setDefaultPlanningVariantAction({ employeeId, variant });
      if (r.error) {
        setDefaultVariant(prev);
        toast.error(r.error);
        return;
      }
      toast.success(`Variante ${variant} définie comme planning par défaut du travailleur.`);
      router.refresh();
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const r = await regeneratePlanningProposalAction({
        employeeId,
        startDate,
        scheduleRecurrence: recurrence === "none" ? null : recurrence,
        templateId: templateId || null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.reason ? `Proposition générée. ${r.reason}` : "Proposition générée.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-gold-dark" />
            Proposition de planning
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">
            3 variantes valides sur {proposal?.weeks ?? 3} semaines, à comparer et valider.
            {proposal
              ? ` Générée le ${fmtGeneratedAt(proposal.generated_at)}${proposal.generated_by === "signature" ? " (à la signature)" : ""}.`
              : " Aucune proposition pour l'instant."}
            {" "}Seule la dernière version est conservée.
          </p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Générer une proposition
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {proposal?.reason ? (
          <div className="rounded-md border border-warn bg-warn-light/40 p-2 text-xs text-ink-2">
            {proposal.reason}
          </div>
        ) : null}

        {!proposal ? (
          <div className="text-xs text-ink-3 italic text-center py-6">
            Aucune proposition. Clique sur « Générer une proposition » (démarre demain par défaut),
            ou elle sera générée automatiquement à la signature du contrat.
          </div>
        ) : (
          <>
            <TabletActiveBanner mode={tabletMode} variant={tabletActiveVariant} />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <VariantCard
              employeeId={employeeId}
              variant={proposal.variant_a}
              weeklyHours={proposal.weekly_hours ?? null}
              defaultStartTime={proposal.default_start_time ?? null}
              defaultShiftHours={proposal.default_shift_hours ?? null}
              weeks={proposal.weeks}
              isDefault={defaultVariant === "A"}
              onSetDefault={() => onSelectDefault("A")}
              savingDefault={savingDefault}
              isActiveOnTablet={tabletMode !== "auto_shift" && tabletActiveVariant === "A"}
            />
            <VariantCard
              employeeId={employeeId}
              variant={proposal.variant_b}
              weeklyHours={proposal.weekly_hours ?? null}
              defaultStartTime={proposal.default_start_time ?? null}
              defaultShiftHours={proposal.default_shift_hours ?? null}
              weeks={proposal.weeks}
              isDefault={defaultVariant === "B"}
              onSetDefault={() => onSelectDefault("B")}
              savingDefault={savingDefault}
              isActiveOnTablet={tabletMode !== "auto_shift" && tabletActiveVariant === "B"}
            />
            {proposal.variant_c ? (
              <VariantCard
                employeeId={employeeId}
                variant={proposal.variant_c}
                subtitle={proposal.variant_c.strategy}
                weeklyHours={proposal.weekly_hours ?? null}
                defaultStartTime={proposal.default_start_time ?? null}
                defaultShiftHours={proposal.default_shift_hours ?? null}
                weeks={proposal.weeks}
                isDefault={defaultVariant === "C"}
                onSetDefault={() => onSelectDefault("C")}
                savingDefault={savingDefault}
                isActiveOnTablet={tabletMode !== "auto_shift" && tabletActiveVariant === "C"}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-line p-3 flex items-center justify-center text-center text-[11px] text-ink-3 italic">
                Variante C (complète les jours dispos oubliés par A/B, puis heures
                de pointe) disponible après une nouvelle génération.
              </div>
            )}
          </div>
          </>
        )}

        {proposal ? (
          <div className="rounded-md border border-line bg-surface-2/40 p-2.5 flex items-start gap-2">
            <Tablet className="h-4 w-4 text-gold-dark shrink-0 mt-0.5" />
            <p className="text-[11px] text-ink-2 leading-snug">
              La variante cochée <strong>« Planning par défaut »</strong> est CELLE que le
              travailleur verra sur la tablette du magasin (page <code>/tablette</code>, lecture
              seule). Une seule à la fois — variante <strong>A</strong> par défaut si rien n&apos;est
              coché.
            </p>
          </div>
        ) : null}

        {/* Auto-Shift individuel : la tablette montre le planning RÉEL du jour. */}
        <div
          className={`rounded-md border p-2.5 flex items-start gap-2 ${
            autoShiftOn ? "border-emerald-300 bg-emerald-50" : "border-line bg-surface-2/40"
          }`}
        >
          <Radio className={`h-4 w-4 shrink-0 mt-0.5 ${autoShiftOn ? "text-emerald-600" : "text-ink-3"}`} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
              Auto-Shift
              {autoShiftOn ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Actif
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-ink-2 leading-snug mt-0.5">
              Quand c&apos;est activé, la tablette n&apos;affiche PLUS le variant coché mais le{" "}
              <strong>planning réel du travailleur</strong> (3 semaines, jour en cours mis en avant).
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAutoShift}
            disabled={savingAutoShift}
            aria-pressed={autoShiftOn}
            className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              autoShiftOn ? "bg-emerald-600" : "bg-ink-3/40"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoShiftOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Auto-Variant : la tablette choisit le variant A/B/C du jour. */}
        <div
          className={`rounded-md border p-2.5 flex items-start gap-2 ${
            autoVariantOn ? "border-indigo-300 bg-indigo-50" : "border-line bg-surface-2/40"
          }`}
        >
          <Shuffle className={`h-4 w-4 shrink-0 mt-0.5 ${autoVariantOn ? "text-indigo-600" : "text-ink-3"}`} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
              Auto-Variant
              {autoVariantOn ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Actif
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-ink-2 leading-snug mt-0.5">
              La tablette choisit <strong>automatiquement le variant (A/B/C) qui colle à aujourd&apos;hui</strong>
              {" "}(le variant qui a un shift ce jour ; sinon le prochain le plus proche). Idéal retour de
              congé / désistement : le travailleur voit direct le planning du moment.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAutoVariant}
            disabled={savingAutoVariant}
            aria-pressed={autoVariantOn}
            className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              autoVariantOn ? "bg-indigo-600" : "bg-ink-3/40"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoVariantOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {proposal ? (
          <RenfortSection
            employeeId={employeeId}
            firstName={firstName}
            overtimeCapable={overtimeCapable}
            variantA={proposal.variant_a}
            variantB={proposal.variant_b}
            variantC={proposal.variant_c}
            selectedVariant={defaultVariant}
            bookedDates={bookedDates}
          />
        ) : null}
      </div>

      {/* Dialog de (re)génération */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold-dark" />
              Générer une proposition de planning
            </DialogTitle>
            <DialogDescription>
              Remplit le quota hebdo sur des jours consécutifs disponibles (respecte OFF, indispos,
              pause vendredi). Remplace la proposition courante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                🗓️ Démarrer à partir de
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
              />
              {/* Karim 2026-07-11 : raccourcis PAR SEMAINE (lundi). Défaut centré :
                  semaine dernière -> aujourd'hui au milieu des 3 semaines. */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { label: "Sem. dernière (centré)", value: addDaysISO(mondayOfISO(todayISO()), -7) },
                  { label: "Cette semaine", value: mondayOfISO(todayISO()) },
                  { label: "Sem. prochaine", value: addDaysISO(mondayOfISO(todayISO()), 7) },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setStartDate(mondayOfISO(p.value))}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      mondayOfISO(startDate) === p.value
                        ? "border-gold bg-gold-light/70 text-gold-dark font-bold"
                        : "border-line text-ink-2 hover:border-gold/60"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-ink-3 mt-1">
                Défaut : <strong>semaine dernière</strong> — 3 semaines (passée · en cours · prochaine),
                aujourd&apos;hui au milieu. Les semaines commencent toujours le <strong>lundi</strong>
                {" "}(la date est recalée sur le lundi).
              </p>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                📐 Partir d&apos;un modèle (optionnel)
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
              >
                <option value="">— Aucun (2 variantes fraîches) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-ink-3 mt-1">
                Applique la structure du modèle en re-vérifiant les dispos/off/indispos et la pause vendredi.
              </p>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-ink-3 block mb-1">
                🔁 Génération programmée (à venir)
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-2 py-1.5 border border-line rounded text-sm bg-surface focus:border-gold outline-none"
              >
                <option value="none">Ponctuelle (par défaut)</option>
                <option value="weekly">Hebdomadaire (Phase 2)</option>
                <option value="monthly">Mensuelle (Phase 2)</option>
              </select>
              <p className="text-[10px] text-ink-3 mt-1">
                Le choix est mémorisé ; la récurrence réelle sera câblée plus tard.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="gold" onClick={onGenerate} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Bannière : ce que le travailleur voit RÉELLEMENT sur la tablette maintenant.
function TabletActiveBanner({
  mode,
  variant,
}: {
  mode: "auto_shift" | "auto_variant" | "variant";
  variant: "A" | "B" | "C" | null;
}) {
  const isShift = mode === "auto_shift";
  const isAuto = mode === "auto_variant";
  return (
    <div
      className={`rounded-md border p-2.5 mb-3 flex items-start gap-2 ${
        isShift
          ? "border-emerald-300 bg-emerald-50"
          : isAuto
            ? "border-indigo-300 bg-indigo-50"
            : "border-gold/40 bg-gold-light/40"
      }`}
    >
      <Tablet className="h-4 w-4 shrink-0 mt-0.5 text-ink-2" />
      <p className="text-[11px] text-ink-2 leading-snug">
        <strong>Affiché en ce moment sur la tablette :</strong>{" "}
        {isShift ? (
          "le planning RÉEL du jour (mode Auto-Shift)."
        ) : isAuto ? (
          <>
            la <strong>variante {variant}</strong> — mode Auto-Variant (celle qui colle à aujourd&apos;hui).
          </>
        ) : (
          <>
            la <strong>variante {variant}</strong> (variante cochée par défaut).
          </>
        )}
      </p>
    </div>
  );
}

function VariantCard({
  employeeId,
  variant,
  title,
  subtitle,
  weeklyHours,
  defaultStartTime,
  defaultShiftHours,
  weeks,
  isDefault,
  onSetDefault,
  savingDefault,
  isActiveOnTablet = false,
}: {
  employeeId: string;
  variant: ProposalVariant;
  title?: string;
  subtitle?: string;
  weeklyHours: number | null;
  defaultStartTime: string | null;
  defaultShiftHours: number | null;
  weeks: number;
  isDefault: boolean;
  onSetDefault: () => void;
  savingDefault: boolean;
  /** Ce variant est-il celui RÉELLEMENT affiché sur la tablette aujourd'hui ? */
  isActiveOnTablet?: boolean;
}) {
  const [saving, startSave] = useTransition();

  function onSaveTemplate() {
    const name = window.prompt(
      `Enregistrer la variante ${variant.label} comme modèle réutilisable.\nNom du modèle :`,
      `Modèle ${variant.label} — ${weeklyHours ?? "?"}h`,
    );
    if (name == null) return;
    if (!name.trim()) {
      toast.error("Donne un nom au modèle.");
      return;
    }
    startSave(async () => {
      const r = await savePlanningTemplateAction({
        employeeId,
        name: name.trim(),
        variant: variant.label,
        defaultStartTime: defaultStartTime ?? "10:00",
        defaultShiftHours: defaultShiftHours ?? 8,
        weeklyHours: weeklyHours ?? 0,
        weeks,
      });
      if (r.error) toast.error(r.error);
      else toast.success("Modèle enregistré.");
    });
  }

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        isActiveOnTablet
          ? "border-indigo-500 ring-2 ring-indigo-400/60 shadow-md"
          : isDefault
            ? "border-gold ring-1 ring-gold/40"
            : "border-line"
      }`}
    >
      {isActiveOnTablet ? (
        <div className="bg-indigo-600 text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          📱 Affiché en ce moment sur la tablette
        </div>
      ) : null}
      {/* PHASE 2 : case à cocher « planning par défaut visible sur la tablette ». */}
      <label
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-line ${
          isDefault ? "bg-gold-light/60" : "bg-surface-2/60 hover:bg-surface-2"
        }`}
      >
        <input
          type="radio"
          name={`default-variant-${employeeId}`}
          checked={isDefault}
          onChange={onSetDefault}
          disabled={savingDefault}
          className="h-4 w-4 accent-gold-dark"
        />
        <span className="text-[11px] font-semibold text-ink-2">
          Planning par défaut (tablette)
        </span>
        {isDefault ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-gold-dark">
            {savingDefault ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Sélectionné
          </span>
        ) : null}
      </label>
      <div className="bg-surface-2 px-3 py-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-ink">
            {title ?? `Variante ${variant.label}`}
            <span className="ml-2 text-[11px] font-mono font-normal text-ink-3">
              {variant.total_hours.toFixed(1)}h total
            </span>
          </div>
          <div className="text-[10px] text-ink-3">{subtitle ?? variant.strategy}</div>
        </div>
        {/* Lien DISCRET « enregistrer comme modèle » */}
        <button
          type="button"
          onClick={onSaveTemplate}
          disabled={saving}
          title="Enregistrer cette variante comme modèle réutilisable"
          className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-ink-3 hover:text-gold-dark transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookmarkPlus className="h-3 w-3" />}
          Modèle
        </button>
      </div>
      <div className="divide-y divide-line">
        {variant.weeks.map((w) => (
          <div key={w.week_index} className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-1 flex items-center justify-between">
              <span>
                Semaine {w.week_index + 1} · {fmtLongDate(w.week_start)}–{fmtLongDate(w.week_end)}
              </span>
              <span className="font-mono text-ink-2">{w.total_hours.toFixed(1)}h</span>
            </div>
            {w.shifts.length === 0 ? (
              <div className="text-[11px] text-ink-3 italic">Aucun shift (jours indispo/OFF).</div>
            ) : (
              <ul className="text-[11px] space-y-0.5">
                {w.shifts.map((s, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono w-20 text-ink-3">{fmtDayLabel(s.date)}</span>
                      <span className="font-mono font-bold">
                        {s.start_time}–{s.end_time}
                      </span>
                      {s.pause ? (
                        <span className="text-[9px] text-violet" title={`Pause prière vendredi ${s.pause.start}–${s.pause.end} (verrouillée, hors heures)`}>
                          ⏸ ven. {s.pause.start}–{s.pause.end}
                        </span>
                      ) : null}
                      <span className="ml-auto text-ink-3">{s.hours.toFixed(1)}h</span>
                    </div>
                    {s.breaks && s.breaks.length > 0 ? (
                      <div
                        className="pl-20 flex items-center gap-1 text-[9px] text-ink-3"
                        title="Pauses exclues des heures : le shift est allongé d'autant"
                      >
                        <span className="text-gold-dark">⏸</span>
                        <span className="font-mono">
                          {s.breaks.map((b) => `${b.start}–${b.end}`).join(" · ")}
                        </span>
                        <span className="italic">(hors heures)</span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 border-t border-line bg-surface-2/50 text-[9px] text-ink-3 leading-snug">
        <span className="text-gold-dark">⏸</span> = 2 pauses/jour (fin allongée d&apos;autant).
        Les pauses sont <strong>exclues des heures</strong> travaillées ; sur les magasins
        de Brabant elles sont échelonnées pour garder le magasin couvert.
      </div>
    </div>
  );
}

// ── 🔁 Renfort possible (heures sup) ─────────────────────────────────────────
// Karim 2026-07-09 : les 3 variantes portent sur des JOURS différents. Le
// travailleur preste sa variante PAR DÉFAUT, mais s'il est APTE aux heures sup et
// libre, on peut lui enchaîner un jour issu d'une AUTRE variante (dispo exprimée,
// non déjà travaillée) quand l'entreprise a un besoin. Section INFO + activation
// 1-clic (crée un vrai shift heures sup sur le site principal).
function RenfortSection({
  employeeId,
  firstName,
  overtimeCapable,
  variantA,
  variantB,
  variantC,
  selectedVariant,
  bookedDates,
}: {
  employeeId: string;
  firstName: string;
  overtimeCapable: boolean;
  variantA: ProposalVariant;
  variantB: ProposalVariant;
  variantC: ProposalVariant | null;
  selectedVariant: "A" | "B" | "C";
  bookedDates: string[];
}) {
  // Créneaux candidats = jours des variantes NON par défaut, absents du défaut ET
  // sans shift réel déjà posé (sinon il ne s'agit plus d'un « renfort possible »).
  const booked = new Set(bookedDates);
  const slots = computeReinforcementSlots({
    variantA,
    variantB,
    variantC,
    selectedVariant,
  }).filter((s) => !booked.has(s.date));

  return (
    <div className="rounded-md border border-dashed border-gold/50 bg-gold-light/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Repeat className="h-3.5 w-3.5 text-gold-dark" />
        <span className="text-xs font-bold text-ink">Renfort possible (heures sup)</span>
      </div>

      {!overtimeCapable ? (
        <p className="text-[11px] text-ink-3 italic leading-snug">
          Marquer {firstName} <strong>apte aux heures sup</strong> (case « Éligible aux heures
          supplémentaires » dans les contraintes planning ci-dessus) pour proposer du renfort
          issu des autres variantes.
        </p>
      ) : slots.length === 0 ? (
        <p className="text-[11px] text-ink-3 italic leading-snug">
          Aucun créneau de renfort : les variantes ne dégagent pas de jour dispo supplémentaire
          hors du planning par défaut (ou ils sont déjà planifiés).
        </p>
      ) : (
        <>
          <p className="text-[11px] text-ink-2 leading-snug">
            Jours où {firstName} a exprimé une dispo (autres variantes) mais ne travaille pas déjà.
            Activables <strong>si {firstName} est libre et que l&apos;entreprise a un besoin</strong> —
            crée alors un vrai shift <strong>heures sup</strong> sur son site principal.
          </p>
          <ul className="space-y-1">
            {slots.map((s) => (
              <RenfortSlotRow key={s.date} employeeId={employeeId} slot={s} />
            ))}
          </ul>
          <p className="text-[10px] text-ink-3 leading-snug">
            Besoin d&apos;un renfort classique (autre site / proposition au travailleur) ?{" "}
            <a
              href={`/planning/reinforcement?note=${encodeURIComponent(`Renfort possible : ${firstName} est apte aux heures sup`)}`}
              className="underline hover:text-gold-dark"
            >
              Ouvrir le module renfort
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}

function RenfortSlotRow({
  employeeId,
  slot,
}: {
  employeeId: string;
  slot: ReinforcementSlot;
}) {
  const router = useRouter();
  const [pending, startActivate] = useTransition();

  function onActivate() {
    startActivate(async () => {
      const r = await activateReinforcementShiftAction({
        employeeId,
        date: slot.date,
        startTime: slot.start_time,
        endTime: slot.end_time,
        shiftHours: slot.hours,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Renfort activé (heures sup) le ${fmtDayLabel(slot.date)}.`);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-[11px]">
      <span className="font-mono w-20 text-ink-3">{fmtDayLabel(slot.date)}</span>
      <span className="font-mono font-bold">
        {slot.start_time}–{slot.end_time}
      </span>
      <span className="text-ink-3">{slot.hours.toFixed(1)}h</span>
      <span className="text-[9px] text-ink-3">(variante {slot.from_variants.join("/")})</span>
      <Button
        type="button"
        variant="gold"
        size="sm"
        className="ml-auto h-6 px-2 text-[10px]"
        onClick={onActivate}
        disabled={pending}
        title="Créer un vrai shift heures sup sur le site principal (aucun envoi au travailleur)"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        Activer en renfort
      </Button>
    </li>
  );
}
