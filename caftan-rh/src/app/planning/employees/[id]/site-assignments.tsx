"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, X, Crown, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  assignEmployeeToSiteAction,
  endAssignmentAction,
  deleteAssignmentAction,
  updateSiteManagerAction,
  loadSubstituteCandidatesAction,
} from "./site-actions";

type SubstituteCandidate = {
  id: string;
  full_name: string;
  job_title: string | null;
  start_date: string | null;
  is_manager: boolean;
  is_site_manager: boolean;
  seniority_label: string;
};

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

type Assignment = {
  id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  pct: number | null;
  site: Site | null;
  is_site_manager?: boolean;
  substitute_employee_id?: string | null;
  substitute?: { id: string; full_name: string } | null;
};

export function SiteAssignmentsSection({
  employeeId,
  assignments,
  sites,
}: {
  employeeId: string;
  assignments: Assignment[];
  sites: Site[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [siteId, setSiteId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [pct, setPct] = useState<number>(100);
  const [isSiteManager, setIsSiteManager] = useState(false);
  const [substituteEmployeeId, setSubstituteEmployeeId] = useState<string>("");
  const [substituteCandidates, setSubstituteCandidates] = useState<SubstituteCandidate[]>([]);
  const [loadingCands, setLoadingCands] = useState(false);
  const [pending, startTransition] = useTransition();

  // Quand le site choisi change ET qu on est en mode site_manager, charge les
  // candidats remplacants pour ce site (tries par pertinence).
  useEffect(() => {
    if (!isSiteManager || !siteId) {
      setSubstituteCandidates([]);
      return;
    }
    let cancelled = false;
    setLoadingCands(true);
    loadSubstituteCandidatesAction({ siteId, excludeEmployeeId: employeeId })
      .then((r) => {
        if (!cancelled) setSubstituteCandidates(r.candidates ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingCands(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSiteManager, siteId, employeeId]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const active = assignments.filter(
    (a) => a.start_date <= todayISO && (!a.end_date || a.end_date >= todayISO),
  );
  const past = assignments.filter(
    (a) => a.end_date && a.end_date < todayISO,
  );
  // Karim 2026-05-21 : detection des doublons (>1 affectation active pour le
  // meme site). Empeche le solver de bien fonctionner si non resolu.
  const dupSiteIds = new Set<string>();
  {
    const seen = new Map<string, number>();
    for (const a of active) {
      seen.set(a.site_id, (seen.get(a.site_id) ?? 0) + 1);
    }
    for (const [sid, n] of seen) if (n > 1) dupSiteIds.add(sid);
  }

  function submit() {
    if (!siteId) {
      toast.error("Choisis un site.");
      return;
    }
    startTransition(async () => {
      const r = await assignEmployeeToSiteAction({
        employeeId,
        siteId,
        startDate,
        endDate: endDate || null,
        isPrimary,
        pct,
        isSiteManager: isPrimary ? isSiteManager : false,
        substituteEmployeeId: isPrimary && isSiteManager ? substituteEmployeeId || null : null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Affectation créée. L'employé a été ajouté au groupe chat du site.");
      setAdding(false);
      setSiteId("");
      setIsPrimary(false);
      setIsSiteManager(false);
      setSubstituteEmployeeId("");
      setPct(100);
      setEndDate("");
      router.refresh();
    });
  }

  function endNow(a: Assignment) {
    startTransition(async () => {
      const r = await endAssignmentAction({
        assignmentId: a.id,
        employeeId,
        endDate: todayISO,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affectation clôturée.");
        router.refresh();
      }
    });
  }

  function remove(a: Assignment) {
    if (!confirm("Supprimer définitivement cette affectation ?")) return;
    startTransition(async () => {
      const r = await deleteAssignmentAction({
        assignmentId: a.id,
        employeeId,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Affectation supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="p-4 border-b border-line flex items-center justify-between">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gold-dark" />
            Affectations site
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Détermine sur quel(s) site(s) l'employé travaille. L'ajouter au site
            l'inscrit automatiquement au groupe chat correspondant.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(false)}
          >
            <X className="h-3.5 w-3.5" /> Annuler
          </Button>
        )}
      </div>

      {adding ? (
        <div className="p-4 border-b border-line bg-surface-2/30">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Site
              </span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              >
                <option value="">— choisir —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Début
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Fin (optionnel)
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                Quotité %
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={pct}
                onChange={(e) => setPct(parseInt(e.target.value, 10) || 100)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-1.5"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => {
                  setIsPrimary(e.target.checked);
                  if (!e.target.checked) {
                    setIsSiteManager(false);
                    setSubstituteEmployeeId("");
                  }
                }}
              />
              Site principal
            </label>
            {isPrimary ? (
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={isSiteManager}
                  onChange={(e) => setIsSiteManager(e.target.checked)}
                />
                <Crown className="h-3 w-3 text-gold-dark" />
                Responsable du site
              </label>
            ) : null}
          </div>
          {isPrimary && isSiteManager ? (
            <div className="mt-3 p-3 rounded-md border border-gold/40 bg-gold-light/30 space-y-2">
              <div className="text-[11px] text-ink-2 p-2 bg-white/60 rounded border border-gold/30">
                <strong>Conséquences automatiques :</strong>
                <ul className="list-disc list-inside mt-0.5">
                  <li>force_full_quota = ON (solver sature le quota max)</li>
                  <li>Priorité MAX dans le solver site (tier 0)</li>
                  <li>Choix du créneau le plus long du jour, même si headcount atteint</li>
                  <li>Rallonge des shifts existants jusqu'à épuisement du réservoir</li>
                </ul>
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-gold-dark flex items-center gap-1 mb-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Remplaçant en cas d'absence totale
              </div>
              <p className="text-[11px] text-ink-2 mb-2">
                Si le responsable est en congé ou indisponible, cette personne
                devient le responsable de fait. Liste triée par pertinence
                (manager, autre responsable, ancienneté).
              </p>
              {loadingCands ? (
                <div className="text-xs text-ink-3 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement des candidats…
                </div>
              ) : substituteCandidates.length === 0 ? (
                <div className="text-xs text-ink-3 italic">
                  Aucun autre employé affecté à ce site. Affecte d'abord
                  d'autres collègues, puis reviens ici.
                </div>
              ) : (
                <select
                  value={substituteEmployeeId}
                  onChange={(e) => setSubstituteEmployeeId(e.target.value)}
                  className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
                >
                  <option value="">— pas de remplaçant désigné —</option>
                  {substituteCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.seniority_label}
                      {c.job_title ? ` · ${c.job_title}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button onClick={submit} disabled={pending} size="sm">
              {pending ? "Enregistrement…" : "Créer l'affectation"}
            </Button>
          </div>
        </div>
      ) : null}

      {active.length === 0 && past.length === 0 ? (
        <div className="p-6 text-center text-sm text-ink-3 italic">
          Aucune affectation. Ajoute-en une pour intégrer l'employé au planning
          du site et au groupe chat.
        </div>
      ) : null}

      {dupSiteIds.size > 0 ? (
        <div className="m-4 p-3 rounded-md border-l-4 border-l-danger bg-danger-light/30 text-sm">
          <div className="font-bold text-danger flex items-center gap-1">
            ⚠ Doublons d'affectation détectés
          </div>
          <p className="text-[11px] text-ink-2 mt-1">
            Plusieurs affectations actives existent pour le(s) même(s) site(s) :{" "}
            <strong>{[...dupSiteIds].join(", ")}</strong>. Cela perturbe la
            liste des membres du site et peut fausser le solver. <strong>Action
            requise :</strong> garde 1 seule affectation par site, supprime les
            autres via la croix ✕ (en privilégiant la plus complète :
            principal/responsable + remplaçant). En cas de doute, clôture la
            plus ancienne avec une date de fin égale au début de la suivante.
          </p>
        </div>
      ) : null}

      {active.length > 0 ? (
        <div className="p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
            Actuelles
          </div>
          {active.map((a) => (
            <Row
              key={a.id}
              a={a}
              employeeId={employeeId}
              isDuplicate={dupSiteIds.has(a.site_id)}
              onEnd={() => endNow(a)}
              onDelete={() => remove(a)}
            />
          ))}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="p-4 border-t border-line space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
            Historique
          </div>
          {past.map((a) => (
            <Row key={a.id} a={a} employeeId={employeeId} onDelete={() => remove(a)} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Row({
  a,
  employeeId,
  isDuplicate = false,
  onEnd,
  onDelete,
}: {
  a: Assignment;
  employeeId: string;
  isDuplicate?: boolean;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [isMgr, setIsMgr] = useState(!!a.is_site_manager);
  const [subId, setSubId] = useState<string>(a.substitute_employee_id ?? "");
  const [cands, setCands] = useState<SubstituteCandidate[]>([]);
  const [loadingC, setLoadingC] = useState(false);

  useEffect(() => {
    if (!expanded || !isMgr) return;
    let cancelled = false;
    setLoadingC(true);
    loadSubstituteCandidatesAction({ siteId: a.site_id, excludeEmployeeId: employeeId })
      .then((r) => {
        if (!cancelled) setCands(r.candidates ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingC(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, isMgr, a.site_id, employeeId]);

  function save() {
    startTransition(async () => {
      const r = await updateSiteManagerAction({
        assignmentId: a.id,
        employeeId,
        isSiteManager: isMgr,
        substituteEmployeeId: isMgr ? subId || null : null,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(isMgr ? "Responsable du site enregistré" : "Statut responsable retiré");
        setExpanded(false);
        router.refresh();
      }
    });
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("fr-BE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className={`p-2 border rounded-md ${isDuplicate ? "border-danger/40 bg-danger-light/20" : a.is_site_manager ? "border-gold/40 bg-gold-light/30" : "border-line"}`}>
      {isDuplicate ? (
        <div className="text-[10px] uppercase tracking-wider font-bold text-danger mb-1">
          ⚠ Doublon sur ce site — supprimer ou clôturer
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white text-sm shrink-0"
          style={{ backgroundColor: a.site?.color ?? "#666" }}
        >
          {a.site?.code ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate flex items-center gap-1 flex-wrap">
            {a.site?.name ?? "—"}
            {a.is_primary ? (
              <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-gold-light text-gold-dark">
                Principal
              </span>
            ) : null}
            {a.is_site_manager ? (
              <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-gold text-[#1a1a0d] inline-flex items-center gap-0.5">
                <Crown className="h-2.5 w-2.5" /> Responsable
              </span>
            ) : null}
          </div>
          <div className="text-xs text-ink-3">
            du {fmt(a.start_date)}
            {a.end_date ? ` au ${fmt(a.end_date)}` : " (en cours)"}
            {a.pct && a.pct < 100 ? ` · ${a.pct}%` : ""}
            {a.substitute ? (
              <span className="ml-2">
                · Remplaçant : <strong>{a.substitute.full_name}</strong>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {a.is_primary && onEnd ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((p) => !p)}
            >
              <Crown className="h-3.5 w-3.5" />
              {expanded ? "Fermer" : a.is_site_manager ? "Modifier" : "Responsable…"}
            </Button>
          ) : null}
          {onEnd ? (
            <Button variant="ghost" size="sm" onClick={onEnd}>
              Clôturer
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isMgr}
              onChange={(e) => setIsMgr(e.target.checked)}
            />
            <Crown className="h-3 w-3 text-gold-dark" />
            Responsable du site
          </label>
          {isMgr ? (
            <div className="ml-5 space-y-1">
              <div className="text-[11px] text-ink-2 p-2 bg-white/60 rounded border border-gold/30">
                <strong>Active automatiquement :</strong> saturation max du
                quota · priorité solver · créneau le plus long privilégié.
              </div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1 pt-1">
                <UserCheck className="h-3 w-3" /> Remplaçant en cas d'absence totale
              </div>
              {loadingC ? (
                <div className="text-xs text-ink-3 inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                </div>
              ) : cands.length === 0 ? (
                <div className="text-xs text-ink-3 italic">
                  Aucun autre employé sur ce site. Ajoute d'abord d'autres
                  collègues, puis reviens.
                </div>
              ) : (
                <select
                  value={subId}
                  onChange={(e) => setSubId(e.target.value)}
                  className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
                >
                  <option value="">— pas de remplaçant désigné —</option>
                  {cands.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.seniority_label}
                      {c.job_title ? ` · ${c.job_title}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} disabled={pending}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
