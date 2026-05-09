"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Mail, X, ArrowUpDown, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRealtime } from "@/hooks/use-realtime";
import { PIPELINE_STAGES } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import type { ApplicationListItem } from "@/lib/queries";
import type { ApplicationStatus } from "@/types/database.types";
import { EmailSendDialog } from "@/components/email-send-dialog";
import { detectGender } from "@/lib/heuristics/gender";
import { inferLangs, levelMeets } from "@/lib/heuristics/languages";

const LANG_OPTIONS = ["Français", "Arabe", "Néerlandais", "Anglais"] as const;
const LEVEL_OPTIONS = ["scolaire", "intermediaire", "courant", "bilingue"] as const;
const CONTRACT_OPTIONS = ["CDI", "CDD", "Étudiant", "Flexi", "Intérim", "Stage", "Indépendant"] as const;
const DAY_OPTIONS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

// NRN belge complet : 11 chiffres (avec/sans formatage)
function isNrnComplete(nrn: string | null): boolean {
  if (!nrn) return false;
  const digits = nrn.replace(/\D/g, "");
  return digits.length === 11;
}

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

export function CandidatesTable({
  initialData,
  templates,
}: {
  initialData: ApplicationListItem[];
  templates: Template[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent"); // recent | old | name_asc | name_desc | status
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);

  // Smart Filter Drawer (12 critères, dont 6 nouveaux)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [langSelected, setLangSelected] = useState<Set<string>>(new Set());
  const [langMinLevel, setLangMinLevel] = useState<string>("scolaire");
  const [genderFilter, setGenderFilter] = useState<string>("all"); // all | F | M | unknown
  const [nrnFilter, setNrnFilter] = useState<string>("all"); // all | complete | incomplete
  const [distMin, setDistMin] = useState<string>("");
  const [distMax, setDistMax] = useState<string>("");
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [dispoDays, setDispoDays] = useState<Set<string>>(new Set());

  function toggleSetVal(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  useRealtime("applications", () => router.refresh());

  function applyDatePreset(preset: string) {
    setDatePreset(preset);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().split("T")[0];
    switch (preset) {
      case "today": setDateFrom(iso(today)); setDateTo(iso(today)); break;
      case "7d": {
        const d = new Date(today.getTime() - 7 * 86_400_000);
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "30d": {
        const d = new Date(today.getTime() - 30 * 86_400_000);
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "3m": {
        const d = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        setDateFrom(iso(d)); setDateTo(iso(today)); break;
      }
      case "year":
        setDateFrom(`${today.getFullYear()}-01-01`); setDateTo(iso(today)); break;
      case "all":
      default:
        setDateFrom(""); setDateTo(""); break;
    }
  }

  // Defensive: filter out applications without a candidate (RLS or orphan state)
  const safeData = useMemo(
    () => initialData.filter((a) => a.candidate && a.candidate.id),
    [initialData],
  );

  const sources = useMemo(() => {
    const s = new Set<string>();
    for (const a of safeData) if (a.candidate.source) s.add(a.candidate.source);
    return Array.from(s).sort();
  }, [safeData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const ageMinN = ageMin ? parseInt(ageMin, 10) : null;
    const ageMaxN = ageMax ? parseInt(ageMax, 10) : null;
    const distMinN = distMin ? parseInt(distMin, 10) : null;
    const distMaxN = distMax ? parseInt(distMax, 10) : null;

    const list = safeData.filter((a) => {
      const c = a.candidate;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (fromMs || toMs) {
        const t = c.applied_at ? new Date(c.applied_at).getTime() : 0;
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
      }

      // Âge
      if (ageMinN !== null || ageMaxN !== null) {
        const age = calcAge(c.birth_date ?? null);
        if (age === null) return false;
        if (ageMinN !== null && age < ageMinN) return false;
        if (ageMaxN !== null && age > ageMaxN) return false;
      }

      // Langues + niveau
      if (langSelected.size > 0) {
        const langs = inferLangs({ langs: c.langs ?? null });
        for (const wanted of langSelected) {
          const wantedLow = wanted.toLowerCase();
          const matchKey = Object.keys(langs).find((k) => {
            const lk = k.toLowerCase();
            if (wantedLow === "français") return lk.startsWith("fra") || lk === "fr";
            if (wantedLow === "arabe") return lk.startsWith("ara") || lk === "ar";
            if (wantedLow === "néerlandais") return lk.startsWith("nee") || lk.startsWith("néer") || lk === "nl";
            if (wantedLow === "anglais") return lk.startsWith("ang") || lk.startsWith("eng") || lk === "en";
            return lk === wantedLow;
          });
          if (!matchKey) return false;
          if (!levelMeets(langs[matchKey], langMinLevel)) return false;
        }
      }

      // Genre auto-détecté
      if (genderFilter !== "all") {
        const fn = c.full_name.split(/\s+/)[0] ?? "";
        const g = detectGender(fn);
        if (g !== genderFilter) return false;
      }

      // NRN renseigné
      if (nrnFilter !== "all") {
        const ok = isNrnComplete(c.nrn ?? null);
        if (nrnFilter === "complete" && !ok) return false;
        if (nrnFilter === "incomplete" && ok) return false;
      }

      // Distance domicile-travail (km)
      if (distMinN !== null || distMaxN !== null) {
        const dk = c.distance_km;
        if (dk === null || dk === undefined) return false;
        if (distMinN !== null && dk < distMinN) return false;
        if (distMaxN !== null && dk > distMaxN) return false;
      }

      // Contrat souhaité
      if (contractFilter !== "all") {
        const wanted = (c.wanted_contract_type ?? "").toLowerCase();
        if (!wanted.includes(contractFilter.toLowerCase())) return false;
      }

      // Jours dispo (parsed from raw_payload)
      if (dispoDays.size > 0) {
        const raw = (c.raw_payload ?? {}) as Record<string, unknown>;
        const rawDays =
          raw.dispo_jours ?? raw.jours_dispo ?? raw.availability_days ?? raw.days ?? null;
        let candDays: string[] = [];
        if (Array.isArray(rawDays)) candDays = rawDays.map(String);
        else if (typeof rawDays === "string") candDays = rawDays.split(/[,;|]/).map((s) => s.trim());
        const candDaysLow = candDays.map((d) => d.toLowerCase().slice(0, 3));
        for (const d of dispoDays) {
          if (!candDaysLow.includes(d.toLowerCase().slice(0, 3))) return false;
        }
      }

      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (a.job?.title ?? "").toLowerCase().includes(q)
      );
    });

    // Sort
    const collator = new Intl.Collator("fr", { sensitivity: "base" });
    list.sort((a, b) => {
      switch (sortBy) {
        case "old":
          return new Date(a.candidate.applied_at ?? 0).getTime() - new Date(b.candidate.applied_at ?? 0).getTime();
        case "name_asc":
          return collator.compare(a.candidate.full_name, b.candidate.full_name);
        case "name_desc":
          return collator.compare(b.candidate.full_name, a.candidate.full_name);
        case "status":
          return collator.compare(a.status, b.status);
        case "recent":
        default:
          return new Date(b.candidate.applied_at ?? 0).getTime() - new Date(a.candidate.applied_at ?? 0).getTime();
      }
    });

    return list;
  }, [
    safeData,
    search,
    statusFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    sortBy,
    ageMin,
    ageMax,
    langSelected,
    langMinLevel,
    genderFilter,
    nrnFilter,
    distMin,
    distMax,
    contractFilter,
    dispoDays,
  ]);

  // Compteur de filtres avancés actifs
  const advCount =
    (ageMin || ageMax ? 1 : 0) +
    (langSelected.size > 0 ? 1 : 0) +
    (genderFilter !== "all" ? 1 : 0) +
    (nrnFilter !== "all" ? 1 : 0) +
    (distMin || distMax ? 1 : 0) +
    (contractFilter !== "all" ? 1 : 0) +
    (dispoDays.size > 0 ? 1 : 0);

  function resetAdvanced() {
    setAgeMin(""); setAgeMax("");
    setLangSelected(new Set());
    setLangMinLevel("scolaire");
    setGenderFilter("all");
    setNrnFilter("all");
    setDistMin(""); setDistMax("");
    setContractFilter("all");
    setDispoDays(new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.every((a) => next.has(a.id));
      if (allSelected) for (const a of filtered) next.delete(a.id);
      else for (const a of filtered) next.add(a.id);
      return next;
    });
  }

  const selectedIds = Array.from(selected);
  const selectedApps = initialData.filter((a) => selected.has(a.id));
  const recipientPreview = selectedApps.length === 1
    ? selectedApps[0].candidate.full_name
    : `${selectedApps.length} candidats`;

  const allVisibleSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  return (
    <>
      <Card>
        <div className="p-3 border-b border-line space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer pr-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-4 w-4 rounded border-line"
              />
              <span className="text-xs font-semibold text-ink-2">{allVisibleSelected ? "Désélectionner tout" : "Sélectionner tout"}</span>
            </label>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <Input
                placeholder="Rechercher nom, email, ville, offre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px]">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Trier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Plus récent</SelectItem>
                <SelectItem value="old">Plus ancien</SelectItem>
                <SelectItem value="name_asc">Nom A → Z</SelectItem>
                <SelectItem value="name_desc">Nom Z → A</SelectItem>
                <SelectItem value="status">Par statut</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={drawerOpen || advCount > 0 ? "gold" : "outline"}
              size="sm"
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtres avancés
              {advCount > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-gold-dark text-[10px] font-bold px-1">
                  {advCount}
                </span>
              ) : null}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${drawerOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </div>

          {drawerOpen ? (
            <div className="mt-2 p-3 rounded-md border border-violet/30 bg-violet/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-violet uppercase tracking-wider">
                  Filtres avancés (Smart Filter)
                </div>
                {advCount > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-bold text-violet hover:underline"
                    onClick={resetAdvanced}
                  >
                    Réinitialiser ({advCount})
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {/* Âge */}
                <div>
                  <label className="block font-bold text-ink-2 mb-1">Âge (de / à)</label>
                  <div className="flex gap-1">
                    <Input type="number" placeholder="min" value={ageMin}
                      onChange={(e) => setAgeMin(e.target.value)} className="h-8 text-xs" min="14" max="80" />
                    <Input type="number" placeholder="max" value={ageMax}
                      onChange={(e) => setAgeMax(e.target.value)} className="h-8 text-xs" min="14" max="80" />
                  </div>
                </div>

                {/* Distance */}
                <div>
                  <label className="block font-bold text-ink-2 mb-1">Distance (km)</label>
                  <div className="flex gap-1">
                    <Input type="number" placeholder="min" value={distMin}
                      onChange={(e) => setDistMin(e.target.value)} className="h-8 text-xs" min="0" max="500" />
                    <Input type="number" placeholder="max" value={distMax}
                      onChange={(e) => setDistMax(e.target.value)} className="h-8 text-xs" min="0" max="500" />
                  </div>
                </div>

                {/* Genre */}
                <div>
                  <label className="block font-bold text-ink-2 mb-1">Genre détecté</label>
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="F">Femme</SelectItem>
                      <SelectItem value="M">Homme</SelectItem>
                      <SelectItem value="unknown">Indéterminé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* NRN */}
                <div>
                  <label className="block font-bold text-ink-2 mb-1">NRN (registre national)</label>
                  <Select value={nrnFilter} onValueChange={setNrnFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="complete">Complet (11 chiffres)</SelectItem>
                      <SelectItem value="incomplete">Incomplet/manquant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Contrat souhaité */}
                <div>
                  <label className="block font-bold text-ink-2 mb-1">Contrat souhaité</label>
                  <Select value={contractFilter} onValueChange={setContractFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      {CONTRACT_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Langues + niveau */}
                <div className="md:col-span-2 lg:col-span-1">
                  <label className="block font-bold text-ink-2 mb-1">Langues (niveau min.)</label>
                  <div className="flex flex-wrap gap-1">
                    {LANG_OPTIONS.map((l) => {
                      const active = langSelected.has(l);
                      return (
                        <button
                          key={l}
                          type="button"
                          onClick={() => toggleSetVal(langSelected, l, setLangSelected)}
                          className={`px-2 py-1 rounded-md border text-xs font-semibold transition ${
                            active
                              ? "bg-violet text-white border-violet"
                              : "bg-surface border-line text-ink-2 hover:border-violet"
                          }`}
                        >
                          {l}
                        </button>
                      );
                    })}
                    <Select value={langMinLevel} onValueChange={setLangMinLevel}>
                      <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{lv}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Jours dispo */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="block font-bold text-ink-2 mb-1">Jours disponibles (raw_payload)</label>
                  <div className="flex flex-wrap gap-1">
                    {DAY_OPTIONS.map((d) => {
                      const active = dispoDays.has(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleSetVal(dispoDays, d, setDispoDays)}
                          className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition ${
                            active
                              ? "bg-violet text-white border-violet"
                              : "bg-surface border-line text-ink-2 hover:border-violet"
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Filtre date d'inscription */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-ink-3 uppercase tracking-wider">Date inscription :</span>
            {[
              ["all", "Tout"],
              ["today", "Aujourd'hui"],
              ["7d", "7 jours"],
              ["30d", "30 jours"],
              ["3m", "3 mois"],
              ["year", "Cette année"],
              ["custom", "Personnalisé"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => k === "custom" ? setDatePreset("custom") : applyDatePreset(k)}
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition ${
                  datePreset === k
                    ? "bg-violet text-white border-violet"
                    : "bg-surface border-line text-ink-2 hover:border-violet"
                }`}
              >
                {label}
              </button>
            ))}
            {datePreset === "custom" ? (
              <>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
                <span className="text-ink-3">→</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
              </>
            ) : null}
            <span className="ml-auto text-ink-2 font-mono text-xs">
              {filtered.length} / {safeData.length} candidat{safeData.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-3">
            Aucune candidature ne correspond aux filtres.
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setSourceFilter("all"); applyDatePreset("all"); resetAdvanced(); }}
              className="block mx-auto mt-3 text-gold-dark font-bold hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.slice(0, 500).map((app) => {
              const checked = selected.has(app.id);
              return (
                <div
                  key={app.id}
                  className={`flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors ${checked ? "bg-gold-light/30" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(app.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-line shrink-0"
                  />
                  <Link href={`/rh/candidates/${app.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <NameAvatar name={app.candidate.full_name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{app.candidate.full_name}</div>
                      <div className="text-xs text-ink-3 truncate flex items-center gap-2">
                        <span>{app.candidate.email}</span>
                        {app.candidate.city ? <span>· {app.candidate.city}</span> : null}
                      </div>
                    </div>
                    <div className="hidden md:block text-xs text-ink-2 max-w-[160px] truncate">
                      {app.job?.title ?? "Spontanée"}
                    </div>
                    <div className="text-[11px] text-ink-3 hidden sm:flex flex-col items-end">
                      <span>Inscrit le {formatDate(app.candidate.applied_at)}</span>
                      {app.candidate.source ? <span className="text-[10px] opacity-70">via {app.candidate.source}</span> : null}
                    </div>
                    <Badge variant={app.status as ApplicationStatus}>{STATUS_LABELS[app.status]}</Badge>
                  </Link>
                </div>
              );
            })}
            {filtered.length > 500 ? (
              <div className="p-4 text-center text-xs text-ink-3 bg-surface-2">
                Affichage limité aux 500 premiers résultats. Utilise les filtres pour affiner ({filtered.length - 500} de plus disponibles).
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur-xl text-white px-5 py-3 flex items-center gap-3 border-t border-white/10">
          <span className="font-bold text-sm">{selected.size} candidat{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" /> Tout désélectionner
            </Button>
            <Button variant="gold" onClick={() => setEmailOpen(true)}>
              <Mail className="h-4 w-4" /> Envoyer email ({selected.size})
            </Button>
          </div>
        </div>
      ) : null}

      <EmailSendDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        applicationIds={selectedIds}
        recipientPreview={recipientPreview}
        templates={templates}
      />
    </>
  );
}
