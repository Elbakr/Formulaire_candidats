"use client";

// Admin UI pour /admin/bonus — primes / concours équipe.
//
// 3 zones :
//   1. Liste campagnes (active / passée) + bouton "Calculer & attribuer"
//   2. Form modale "Nouvelle campagne"
//   3. Historique awards (bouton « payée », montant, raison)

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Star,
  Trophy,
  PlayCircle,
  CheckCircle2,
  Power,
  PowerOff,
  Award,
  Euro,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createBonusCampaignAction,
  toggleBonusCampaignActiveAction,
  deleteBonusCampaignAction,
  computeAndAwardCampaignAction,
  manualAwardAction,
  markAwardPaidAction,
  deleteAwardAction,
  type BonusRuleKind,
} from "./actions";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  rule_kind: BonusRuleKind;
  budget_total: number | null;
  per_person_max: number | null;
  prize_distribution: Array<{ rank: number; amount: number }> | null;
  scope_site_id: string | null;
  is_active: boolean | null;
};

type Award = {
  id: string;
  campaign_id: string;
  employee_id: string;
  amount: number;
  rank: number | null;
  reason: string | null;
  paid_at: string | null;
  created_at: string | null;
};

type Site = { id: string; code: string; name: string };
type Employee = { id: string; full_name: string };

const RULE_LABEL: Record<BonusRuleKind, string> = {
  top_attendance: "Top présence (heures pointées sans anomalie)",
  top_score: "Top score (KPI agrégé)",
  top_seller: "Top vendeur (WooCommerce — V2)",
  no_absence: "Aucune absence imprévue",
  custom: "Attribution manuelle",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BonusAdmin({
  campaigns,
  awards,
  sites,
  employees,
}: {
  campaigns: Campaign[];
  awards: Award[];
  sites: Site[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCampaignId, setManualCampaignId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const manualFormRef = useRef<HTMLFormElement>(null);

  const today = todayISO();
  const empMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.full_name);
    return m;
  }, [employees]);
  const siteMap = useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  function refresh() {
    router.refresh();
  }

  function onCreate(fd: FormData) {
    startTransition(async () => {
      const r = await createBonusCampaignAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Campagne créée.");
        formRef.current?.reset();
        setOpen(false);
        refresh();
      }
    });
  }

  function onToggle(id: string, active: boolean) {
    startTransition(async () => {
      const r = await toggleBonusCampaignActiveAction(id, !active);
      if ("error" in r && r.error) toast.error(r.error);
      else refresh();
    });
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Supprimer la campagne "${name}" et tous ses awards ?`)) return;
    startTransition(async () => {
      const r = await deleteBonusCampaignAction(id);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Supprimée.");
        refresh();
      }
    });
  }

  function onCompute(id: string, name: string, ruleKind: BonusRuleKind) {
    if (ruleKind === "top_seller") {
      toast.error("Non disponible — WooCommerce requis (V2).");
      return;
    }
    if (ruleKind === "custom") {
      toast.info("Règle « custom » : utilise le bouton « + Awarder » ci-dessous.");
      return;
    }
    if (
      !confirm(
        `Calculer et attribuer les gagnants pour "${name}" ? Les awards existants de cette campagne seront remplacés.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await computeAndAwardCampaignAction(id);
      if ("error" in r && r.error) toast.error(r.error);
      else if ("created" in r) {
        toast.success(`${r.created} gagnant(s) attribué(s).`);
        refresh();
      }
    });
  }

  function onManual(fd: FormData) {
    startTransition(async () => {
      const r = await manualAwardAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Award attribué.");
        manualFormRef.current?.reset();
        setManualOpen(false);
        refresh();
      }
    });
  }

  function onMarkPaid(awardId: string) {
    startTransition(async () => {
      const r = await markAwardPaidAction(awardId);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Marqué comme payé.");
        refresh();
      }
    });
  }

  function onDeleteAward(awardId: string) {
    if (!confirm("Supprimer cet award ?")) return;
    startTransition(async () => {
      const r = await deleteAwardAction(awardId);
      if ("error" in r && r.error) toast.error(r.error);
      else refresh();
    });
  }

  const awardsByCampaign = useMemo(() => {
    const m = new Map<string, Award[]>();
    for (const a of awards) {
      const arr = m.get(a.campaign_id) ?? [];
      arr.push(a);
      m.set(a.campaign_id, arr);
    }
    return m;
  }, [awards]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Primes &amp; concours</h1>
          <p className="text-sm text-ink-2">
            Concours équipe : top présence, top score, sans absence. Le système
            calcule les gagnants automatiquement à la fin de la période.
          </p>
        </div>
        <Button variant="gold" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle campagne
        </Button>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b border-line">
          <h2 className="font-bold">Campagnes ({campaigns.length})</h2>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-8 text-sm text-ink-3 text-center">
            Aucune campagne. Crée la première pour démarrer un concours équipe.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((c) => {
              const status =
                c.end_date < today
                  ? "passée"
                  : c.start_date > today
                    ? "à venir"
                    : "en cours";
              const statusTone =
                status === "en cours"
                  ? "bg-success-light text-success"
                  : status === "à venir"
                    ? "bg-info-light text-info"
                    : "bg-surface-2 text-ink-3";
              const cAwards = awardsByCampaign.get(c.id) ?? [];
              return (
                <li key={c.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{c.name}</div>
                      <div className="text-xs text-ink-3">
                        {c.start_date} → {c.end_date} · {RULE_LABEL[c.rule_kind]}
                        {c.scope_site_id && siteMap.get(c.scope_site_id) ? (
                          <> · Site {siteMap.get(c.scope_site_id)!.code}</>
                        ) : (
                          <> · Tous sites</>
                        )}
                      </div>
                      {c.description ? (
                        <div className="text-xs text-ink-2 mt-0.5">{c.description}</div>
                      ) : null}
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusTone}`}
                    >
                      {status}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCompute(c.id, c.name, c.rule_kind)}
                      disabled={pending}
                      title="Calculer les gagnants"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Calculer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setManualCampaignId(c.id);
                        setManualOpen(true);
                      }}
                      title="Awarder manuellement"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Awarder
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggle(c.id, c.is_active !== false)}
                      title={c.is_active !== false ? "Désactiver" : "Activer"}
                    >
                      {c.is_active !== false ? (
                        <Power className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <PowerOff className="h-3.5 w-3.5 text-ink-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(c.id, c.name)}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>

                  {/* Sous-liste awards de cette campagne */}
                  {cAwards.length > 0 ? (
                    <ul className="mt-2 ml-11 divide-y divide-line border border-line rounded-md bg-surface-2/50">
                      {cAwards.map((a) => (
                        <li
                          key={a.id}
                          className="p-2 text-xs flex items-center gap-2 flex-wrap"
                        >
                          {a.rank ? (
                            <span className="font-bold w-7 text-gold-dark">
                              #{a.rank}
                            </span>
                          ) : (
                            <Award className="h-3.5 w-3.5 text-gold-dark" />
                          )}
                          <span className="font-semibold flex-1 min-w-0 truncate">
                            {empMap.get(a.employee_id) ?? "—"}
                          </span>
                          <span className="font-mono font-bold">
                            {Number(a.amount).toFixed(2)} €
                          </span>
                          {a.paid_at ? (
                            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-success-light text-success">
                              Payée
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onMarkPaid(a.id)}
                              title="Marquer payée"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteAward(a.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-3 w-3 text-danger" />
                          </Button>
                          {a.reason ? (
                            <div className="basis-full text-ink-3 pl-9">
                              {a.reason}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Total payé / non payé */}
      {awards.length > 0 ? (
        <Card>
          <div className="p-3 sm:p-4 flex items-center gap-4 flex-wrap">
            <Euro className="h-4 w-4 text-gold-dark" />
            <div className="text-sm">
              <strong>{awards.length}</strong> award(s) au total —{" "}
              <strong className="text-success">
                {awards.filter((a) => a.paid_at).reduce((s, a) => s + Number(a.amount), 0).toFixed(2)} €
              </strong>{" "}
              payés ·{" "}
              <strong className="text-warn">
                {awards.filter((a) => !a.paid_at).reduce((s, a) => s + Number(a.amount), 0).toFixed(2)} €
              </strong>{" "}
              à payer
            </div>
          </div>
        </Card>
      ) : null}

      {/* Dialog création campagne */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle campagne de prime</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={onCreate} className="space-y-3">
            <div>
              <Label htmlFor="bc-name">Nom</Label>
              <Input id="bc-name" name="name" required placeholder="Concours Aïd 2026" />
            </div>
            <div>
              <Label htmlFor="bc-desc">Description (optionnel)</Label>
              <Textarea id="bc-desc" name="description" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bc-start">Date début</Label>
                <Input id="bc-start" name="start_date" type="date" required />
              </div>
              <div>
                <Label htmlFor="bc-end">Date fin</Label>
                <Input id="bc-end" name="end_date" type="date" required />
              </div>
            </div>
            <div>
              <Label htmlFor="bc-rule">Règle d'attribution</Label>
              <Select name="rule_kind" defaultValue="top_attendance">
                <SelectTrigger id="bc-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top_attendance">Top présence</SelectItem>
                  <SelectItem value="top_score">Top score</SelectItem>
                  <SelectItem value="no_absence">Aucune absence imprévue</SelectItem>
                  <SelectItem value="custom">Manuelle (custom)</SelectItem>
                  <SelectItem value="top_seller" disabled>
                    Top vendeur (V2 — WooCommerce)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bc-budget">Budget total (€)</Label>
                <Input
                  id="bc-budget"
                  name="budget_total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="500"
                />
              </div>
              <div>
                <Label htmlFor="bc-perp">Plafond / personne (€)</Label>
                <Input
                  id="bc-perp"
                  name="per_person_max"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="50"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bc-dist">
                Distribution prix — JSON, top 3 par défaut
              </Label>
              <Textarea
                id="bc-dist"
                name="prize_distribution"
                rows={3}
                placeholder='[{"rank":1,"amount":50},{"rank":2,"amount":30},{"rank":3,"amount":20}]'
                defaultValue='[{"rank":1,"amount":50},{"rank":2,"amount":30},{"rank":3,"amount":20}]'
              />
              <p className="text-[11px] text-ink-3 mt-0.5">
                Utilisé par les règles top_attendance et top_score. Pour
                no_absence, on prend per_person_max ou budget_total / N.
              </p>
            </div>
            <div>
              <Label htmlFor="bc-site">Scope (site)</Label>
              <Select name="scope_site_id" defaultValue="">
                <SelectTrigger id="bc-site">
                  <SelectValue placeholder="Tous les sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous les sites</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Site {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" disabled={pending}>
                Créer la campagne
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog award manuel */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Awarder manuellement</DialogTitle>
          </DialogHeader>
          <form ref={manualFormRef} action={onManual} className="space-y-3">
            <input type="hidden" name="campaign_id" value={manualCampaignId ?? ""} />
            <div>
              <Label htmlFor="ma-emp">Employé</Label>
              <Select name="employee_id">
                <SelectTrigger id="ma-emp">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ma-amount">Montant (€)</Label>
                <Input
                  id="ma-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
              <div>
                <Label htmlFor="ma-rank">Rang (optionnel)</Label>
                <Input id="ma-rank" name="rank" type="number" min="1" />
              </div>
            </div>
            <div>
              <Label htmlFor="ma-reason">Raison</Label>
              <Textarea id="ma-reason" name="reason" rows={2} placeholder="Effort exceptionnel sur la période Aïd." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" disabled={pending}>
                Awarder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
