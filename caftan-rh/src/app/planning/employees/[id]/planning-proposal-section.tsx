"use client";

// Karim 2026-07-09 : PROPOSITION DE PLANNING (Phase 1) — affichage lecture des 2
// variantes (3 semaines) + bouton (re)génération (date de début éditable) +
// modèles réutilisables (enregistrer / partir d'un modèle). AUCUN envoi
// travailleur. La SÉLECTION d'une variante par défaut = Phase 2 (TODO).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CalendarClock, BookmarkPlus, Check, Tablet } from "lucide-react";
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
  regeneratePlanningProposalAction,
  savePlanningTemplateAction,
  setDefaultPlanningVariantAction,
} from "./planning-proposal-actions";

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

function tomorrowISO(): string {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const [y, m, d] = now.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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
}: {
  employeeId: string;
  proposal: CurrentProposal;
  templates: PlanningTemplateLite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(proposal?.start_date ?? tomorrowISO());
  const [templateId, setTemplateId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<string>("none");
  const [pending, startTransition] = useTransition();

  // PHASE 2 : variante par défaut visible par le travailleur sur la tablette.
  // Défaut 'A' si rien n'a été coché (aligné sur la logique tablette).
  const [defaultVariant, setDefaultVariant] = useState<"A" | "B" | "C">(
    proposal?.selected_variant ?? "A",
  );
  const [savingDefault, startSaveDefault] = useTransition();

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
            />
            {proposal.variant_c ? (
              <VariantCard
                employeeId={employeeId}
                variant={proposal.variant_c}
                title="Variante C — répartie sur la semaine"
                subtitle="Couvre tous tes jours dispos"
                weeklyHours={proposal.weekly_hours ?? null}
                defaultStartTime={proposal.default_start_time ?? null}
                defaultShiftHours={proposal.default_shift_hours ?? null}
                weeks={proposal.weeks}
                isDefault={defaultVariant === "C"}
                onSetDefault={() => onSelectDefault("C")}
                savingDefault={savingDefault}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-line p-3 flex items-center justify-center text-center text-[11px] text-ink-3 italic">
                Variante C (répartie sur toute la semaine) disponible après une
                nouvelle génération.
              </div>
            )}
          </div>
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
              <p className="text-[10px] text-ink-3 mt-1">Défaut : demain.</p>
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
        isDefault ? "border-gold ring-1 ring-gold/40" : "border-line"
      }`}
    >
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
