// Karim 2026-05-25 : dashboard exhaustif des heures REELLEMENT prestees
// (basees sur clock_entries, pas sur shifts planifies).
//
// Affiche :
// - KPIs globaux (total heures, employes actifs, moyenne, taux presence)
// - Filtres periode (jour/semaine/mois/custom) + ville/site
// - Tableau croise employe x jour avec totaux ligne + colonne
// - Top sites par heures et top employes par heures
// - Detail par site (sous-total + headcount)

import Link from "next/link";
import { Clock, TrendingUp, Users, MapPin, ArrowLeft, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { readCity, siteCodesForCity, type City } from "@/lib/city";
import { HeuresFilters } from "./heures-filters";

type SearchParams = {
  view?: "day" | "week" | "month" | "custom";
  date?: string;
  from?: string;
  to?: string;
  scope?: "city" | "all";
};

function fmtH(min: number): string {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay() || 7; // lundi=1, dimanche=7
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function resolvePeriod(sp: SearchParams): { from: string; to: string; label: string } {
  const view = sp.view ?? "week";
  const date = sp.date ? new Date(sp.date) : new Date();
  if (view === "day") {
    const iso = toISO(date);
    return { from: iso, to: iso, label: iso };
  }
  if (view === "week") {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: toISO(start), to: toISO(end), label: `Sem. ${toISO(start)} → ${toISO(end)}` };
  }
  if (view === "month") {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return { from: toISO(start), to: toISO(end), label: `${toISO(start).slice(0, 7)}` };
  }
  // custom
  const from = sp.from ?? toISO(new Date(Date.now() - 7 * 86400_000));
  const to = sp.to ?? toISO(new Date());
  return { from, to, label: `${from} → ${to}` };
}

export default async function HeuresPresteesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const city: City = await readCity();
  const cityCodes = siteCodesForCity(city);
  const period = resolvePeriod(sp);
  const scope = sp.scope === "all" ? "all" : "city";

  // 1. Sites (toujours tous - on filtre apres selon scope)
  const { data: sitesAllRaw } = await supabase
    .from("sites")
    .select("id, code, name, color, light_color, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  type Site = { id: string; code: string; name: string; color: string | null; light_color: string | null; sort_order: number };
  const sitesAll = (sitesAllRaw ?? []) as Site[];
  const sitesScope = scope === "all"
    ? sitesAll
    : sitesAll.filter((s) => cityCodes.includes(s.code));
  const scopeSiteIds = new Set(sitesScope.map((s) => s.id));
  const siteById = new Map(sitesAll.map((s) => [s.id, s]));

  // 2. Tous les clock_entries de la periode (IN + OUT)
  // Karim 2026-05-25 v3 : on charge AUSSI 60 jours d historique avant la
  // periode pour calculer le PROFIL HORAIRE de chaque employe (pattern
  // habituel) et detecter automatiquement les evening workers ou les erreurs
  // de doigt recurrentes.
  const fromTs = `${period.from}T00:00:00Z`;
  const toTs = `${period.to}T23:59:59Z`;
  const historyFromTs = new Date(new Date(period.from + "T00:00:00Z").getTime() - 60 * 86400_000).toISOString();
  const { data: entriesRaw } = await supabase
    .from("clock_entries")
    .select("id, employee_id, kind, occurred_at, site_id, source, auto_clocked_out")
    .gte("occurred_at", historyFromTs)
    .lte("occurred_at", toTs)
    .order("occurred_at", { ascending: true });
  type Entry = {
    id: string;
    employee_id: string;
    kind: "in" | "out";
    occurred_at: string;
    site_id: string | null;
    source: string | null;
    auto_clocked_out: boolean | null;
  };
  const entriesAll = (entriesRaw ?? []) as Entry[];
  const entries = entriesAll.filter((e) => e.occurred_at >= fromTs);

  // 2b. site_needs pour open_time/close_time par site et jour de semaine
  // (Karim 2026-05-25 : reglement IN matin / OUT fin d apres-midi, combler les
  // orphelins via open/close_time du site).
  const { data: needsRaw } = await supabase
    .from("site_needs")
    .select("site_id, day_of_week, start_time, end_time, is_enabled")
    .eq("is_enabled", true);
  type SiteNeed = { site_id: string; day_of_week: number; start_time: string; end_time: string; is_enabled: boolean };
  const needs = (needsRaw ?? []) as SiteNeed[];
  function siteHoursFor(siteId: string, dateISO: string): { open: string; close: string } | null {
    const dow = new Date(dateISO + "T00:00:00").getDay();
    const matching = needs.filter((n) => n.site_id === siteId && n.day_of_week === dow);
    if (matching.length === 0) return null;
    const open = matching.reduce((a, n) => (a < n.start_time.slice(0, 5) ? a : n.start_time.slice(0, 5)), matching[0].start_time.slice(0, 5));
    const close = matching.reduce((a, n) => (a > n.end_time.slice(0, 5) ? a : n.end_time.slice(0, 5)), matching[0].end_time.slice(0, 5));
    return { open, close };
  }

  // 3. Liste des employees impliques + leurs noms + job_title pour detecter
  // les patterns de travail atypiques (ex: schoonmaak / menage en soiree).
  const empIds = [...new Set(entries.map((e) => e.employee_id))];
  const { data: empsRaw } = empIds.length
    ? await supabase
        .from("employees")
        .select("id, full_name, job_title, status")
        .in("id", empIds)
    : { data: [] };
  type Emp = { id: string; full_name: string; job_title: string | null; status: string };
  const emps = (empsRaw ?? []) as Emp[];
  const empById = new Map(emps.map((e) => [e.id, e]));

  // Karim 2026-05-25 v3 : PROFIL HORAIRE par employe base sur 60 jours
  // d historique. Pour chaque employe on calcule :
  //   - nb d events matinaux (<14h) vs tardifs (>=14h)
  //   - heure mediane de premier event quotidien (IN typique)
  //   - heure mediane de dernier event quotidien (OUT typique)
  //   - ratio IN/OUT par tranche horaire (detecte erreurs de doigt recurrentes)
  // L objectif : prendre des decisions "humaines" basees sur le pattern reel
  // de chaque personne, plutot qu une regle horaire fixe.
  type EmpProfile = {
    isEveningWorker: boolean; // >30% des jours-travailles ont IN apres 16h
    typicalInHour: number;     // mediane heure de 1er event/jour
    typicalOutHour: number;    // mediane heure de dernier event/jour
    fingerErrorRatio: number;  // % d events de kind contre-intuitif vs heure
  };
  const profileByEmp = new Map<string, EmpProfile>();
  // Group entriesAll par (employe, jour local)
  function localDayOfIso(iso: string): string {
    return new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
  }
  function localHourOfIso(iso: string): number {
    const d = new Date(new Date(iso).getTime() + 2 * 3600_000);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  }
  const histByEmp = new Map<string, Map<string, Entry[]>>();
  for (const e of entriesAll) {
    const day = localDayOfIso(e.occurred_at);
    const m = histByEmp.get(e.employee_id) ?? new Map();
    const arr = m.get(day) ?? [];
    arr.push(e);
    m.set(day, arr);
    histByEmp.set(e.employee_id, m);
  }
  for (const [empId, dayMap] of histByEmp) {
    const firstHours: number[] = [];
    const lastHours: number[] = [];
    let totalEvents = 0;
    let lateIns = 0;
    let earlyOuts = 0;
    // Karim 2026-05-25 : ne compte un "vrai shift soir" QUE si il y a un IN
    // tardif (>=16h) ET un OUT apres dans la meme journee. Sinon, un IN orphan
    // tardif n est pas un vrai shift soir (souvent un OUT mal labellise).
    let daysWithRealEveningShift = 0;
    for (const [, evs] of dayMap) {
      const sorted = [...evs].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
      if (sorted.length === 0) continue;
      firstHours.push(localHourOfIso(sorted[0].occurred_at));
      lastHours.push(localHourOfIso(sorted[sorted.length - 1].occurred_at));
      let hasRealEveningShift = false;
      for (let k = 0; k < sorted.length; k++) {
        const ev = sorted[k];
        totalEvents++;
        const h = localHourOfIso(ev.occurred_at);
        if (ev.kind === "in") {
          if (h >= 16) {
            lateIns++;
            // Verifie qu il y a un OUT apres dans la journee
            const hasOutAfter = sorted.slice(k + 1).some((x) => x.kind === "out");
            if (hasOutAfter) hasRealEveningShift = true;
          }
        } else {
          if (h <= 12) earlyOuts++;
        }
      }
      if (hasRealEveningShift) daysWithRealEveningShift++;
    }
    const totalDays = dayMap.size;
    firstHours.sort((a, b) => a - b);
    lastHours.sort((a, b) => a - b);
    const median = (arr: number[]) => arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)];
    // Seuil 30% : il faut au moins 30% des jours-travailles avec un VRAI shift
    // soir complet pour etre classe evening worker
    const profile: EmpProfile = {
      isEveningWorker: totalDays >= 3 && daysWithRealEveningShift / totalDays > 0.3,
      typicalInHour: median(firstHours),
      typicalOutHour: median(lastHours),
      fingerErrorRatio: totalEvents > 0 ? (earlyOuts + lateIns) / totalEvents : 0,
    };
    profileByEmp.set(empId, profile);
  }

  // Fallback name-based pour pattern "schoonmaak/menage" si pas assez d historique
  function isEveningWorker(empId: string): boolean {
    const p = profileByEmp.get(empId);
    if (p && p.isEveningWorker) return true;
    const e = empById.get(empId);
    if (!e) return false;
    const txt = `${e.full_name} ${e.job_title ?? ""}`.toLowerCase();
    return /schoonmaak|m(e|é)nag|nettoyage|cleaning|soir(e|é)e/.test(txt);
  }

  // 4. Site assignments pour filtrer par ville (employes non assignes restent en BXL)
  const { data: assignsRaw } = empIds.length
    ? await supabase
        .from("site_assignments")
        .select("employee_id, site_id, is_primary")
        .in("employee_id", empIds)
    : { data: [] };
  type Assign = { employee_id: string; site_id: string; is_primary: boolean };
  const assigns = (assignsRaw ?? []) as Assign[];
  const sitesByEmp = new Map<string, Set<string>>();
  for (const a of assigns) {
    const set = sitesByEmp.get(a.employee_id) ?? new Set();
    set.add(a.site_id);
    sitesByEmp.set(a.employee_id, set);
  }
  // Filtre employes selon scope
  const inScope = (empId: string): boolean => {
    if (scope === "all") return true;
    const ids = sitesByEmp.get(empId);
    if (!ids || ids.size === 0) return city === "bruxelles"; // sans assignation -> BXL par defaut
    return [...ids].some((sid) => scopeSiteIds.has(sid));
  };

  // 5. Pairage SMART par (employé, jour) avec reclasse horaire.
  //
  // Karim 2026-05-25 v2 — regle metier :
  //   - IN attendu : matin (avant 14h local)
  //   - OUT attendu : fin d apres-midi (apres 14h local)
  //   - Pauses : un employe peut sortir/rentrer (sequence IN/OUT/IN/OUT par jour)
  //   - Si IN orphelin (pas d OUT le meme jour) -> OUT virtuel = close_time site
  //   - Si OUT orphelin (pas d IN avant) -> IN virtuel = open_time site
  //   - Micro-paires (< 2 min) ignorees (fausses manips)
  //
  // L alternance brute IN/OUT du tuya-poll est souvent fausse (employe qui
  // oublie de pointer un jour). On RECLASSE chaque event par son heure :
  //   - event entre 04h et 14h local -> kind IN
  //   - event entre 14h et 04h (lendemain) -> kind OUT
  // (cutoff 14h car pause dejeuner finit vers cette heure)

  // Karim 2026-05-26 : separer heures CONFIRMEES Tuya (IN+OUT reels) vs
  // ESTIMEES (auto_close, reclasse, virtual). Les KPIs principaux doivent
  // afficher les 2 separement pour ne pas tromper le RH.
  type DayRow = {
    date: string;
    minutesConfirmed: number;
    minutesEstimated: number;
    site_id: string | null;
  };
  const byEmpDay = new Map<string, Map<string, DayRow>>();
  const bySiteMinutes = new Map<string, number>(); // total (confirme + estime)
  const byEmpMinutes = new Map<string, number>();  // total (confirme + estime)
  const byEmpConfirmed = new Map<string, number>(); // confirme uniquement
  const byEmpEstimated = new Map<string, number>(); // estime uniquement
  let totalMinutes = 0;
  let totalConfirmed = 0;
  let totalEstimated = 0;

  // Group entries par (employe, jour LOCAL UTC+2). On reclasse kind selon heure.
  function localDayOf(iso: string): string {
    // UTC+2 = heure locale BE (sera +1 en hiver mais on prend +2 simple)
    const local = new Date(new Date(iso).getTime() + 2 * 3600_000);
    return local.toISOString().slice(0, 10);
  }
  function localHour(iso: string): number {
    const local = new Date(new Date(iso).getTime() + 2 * 3600_000);
    return local.getUTCHours() + local.getUTCMinutes() / 60;
  }

  type EnrichedEvent = { ts: number; kind: "in" | "out"; site_id: string | null; iso: string; hour: number };
  const byEmpAndDay = new Map<string, Map<string, EnrichedEvent[]>>();
  for (const e of entries) {
    if (!inScope(e.employee_id)) continue;
    if (scope !== "all" && e.site_id && !scopeSiteIds.has(e.site_id)) continue;
    const day = localDayOf(e.occurred_at);
    const hour = localHour(e.occurred_at);
    const map = byEmpAndDay.get(e.employee_id) ?? new Map();
    const arr = map.get(day) ?? [];
    // On garde le kind BRUT - reclassement seulement pour les orphelins
    arr.push({ ts: new Date(e.occurred_at).getTime(), kind: e.kind, site_id: e.site_id, iso: e.occurred_at, hour });
    map.set(day, arr);
    byEmpAndDay.set(e.employee_id, map);
  }

  const MIN_PAIR_MS = 2 * 60_000; // 2 min minimum pour valider une paire
  const FAUX_MANIP_MS = 2 * 60_000; // IN+OUT a <2min = fausse manip, ignore les 2

  for (const [empId, dayMap] of byEmpAndDay) {
    for (const [day, eventsRaw] of dayMap) {
      // Trie par ts
      let events = [...eventsRaw].sort((a, b) => a.ts - b.ts);

      // 1) Filtre paires "fausse manip" : si event[i].kind != event[i+1].kind
      //    et diff < 2min, on supprime les 2 (badge double-tap, lecture rapide).
      const cleaned: EnrichedEvent[] = [];
      let i = 0;
      while (i < events.length) {
        const cur = events[i];
        const nxt = events[i + 1];
        if (nxt && cur.kind !== nxt.kind && nxt.ts - cur.ts < FAUX_MANIP_MS) {
          // skip both
          i += 2;
          continue;
        }
        cleaned.push(cur);
        i++;
      }
      events = cleaned;

      // 2) Reclasse les orphelins selon LOGIQUE HUMAINE basee sur le profil
      //    historique de l employe :
      //    - Si l employe pointe d habitude IN matin / OUT soir, et qu il a UN
      //      seul event IN tardif sans OUT apres -> probablement erreur de doigt
      //      ou il a oublie de pointer le matin -> reclasse en OUT
      //    - Idem pour OUT matinal sans IN avant -> reclasse en IN
      //    - SAUF si l employe est evening worker auto-detecte : on ne reclasse
      //      PAS car ses IN tardifs sont normaux
      const isEvening = isEveningWorker(empId);
      const profile = profileByEmp.get(empId);
      const reclassed: EnrichedEvent[] = [];
      for (let j = 0; j < events.length; j++) {
        const e = events[j];
        // IN tardif (>=16h) sans OUT apres : suspect SAUF si evening worker
        if (e.kind === "in" && e.hour >= 16 && !isEvening) {
          const hasOutAfter = events.slice(j + 1).some((x) => x.kind === "out");
          if (!hasOutAfter) {
            // Si le profil historique dit que l employe pointe d habitude IN
            // avant 14h (typicalInHour < 14), c est une vraie anomalie -> reclasse
            const typicalInOk = !profile || profile.typicalInHour < 14;
            if (typicalInOk) {
              reclassed.push({ ...e, kind: "out" });
              continue;
            }
          }
        }
        // OUT matinal (<=12h) sans IN avant : suspect dans tous les cas
        if (e.kind === "out" && e.hour <= 12) {
          const hasInBefore = events.slice(0, j).some((x) => x.kind === "in");
          if (!hasInBefore) {
            // Si profil dit IN typique avant 12h, l erreur de doigt est probable
            const typicalInOk = !profile || profile.typicalInHour <= 13;
            if (typicalInOk) {
              reclassed.push({ ...e, kind: "in" });
              continue;
            }
          }
        }
        reclassed.push(e);
      }
      events = reclassed;

      // 3) Sépare IN et OUT
      const inList = events.filter((e) => e.kind === "in").map((e) => e.ts);
      const outList = events.filter((e) => e.kind === "out").map((e) => e.ts);

      // 4) Detmine site
      const siteId = events.find((e) => e.site_id)?.site_id ?? null;

      // 5) Equilibre via virtuels (open_time / close_time du site)
      let virtualIn: number | null = null;
      let virtualOut: number | null = null;
      if (siteId) {
        const hours = siteHoursFor(siteId, day);
        if (hours) {
          virtualIn = new Date(`${day}T${hours.open}:00+02:00`).getTime();
          virtualOut = new Date(`${day}T${hours.close}:00+02:00`).getTime();
        }
      }

      // Pour chaque IN sans OUT correspondant, ajoute virtualOut.
      // Karim 2026-05-26 : on TRACE les paires estimees (virtual) vs reelles
      // pour pouvoir distinguer les heures CONFIRMEES Tuya des ESTIMEES.
      let finalIns = [...inList];
      let finalOuts = [...outList];
      const realInsSet = new Set(inList);
      const realOutsSet = new Set(outList);
      if (finalIns.length > finalOuts.length) {
        const inSorted = [...finalIns].sort((a, b) => a - b);
        const missingIns = inSorted.slice(finalOuts.length);
        for (const inTs of missingIns) {
          let outTs: number;
          if (isEvening && virtualOut != null && inTs > virtualOut) {
            outTs = inTs + 150 * 60_000;
          } else if (virtualOut != null && virtualOut > inTs) {
            outTs = virtualOut;
          } else {
            outTs = inTs + 150 * 60_000;
          }
          finalOuts.push(outTs);
        }
        finalOuts.sort((a, b) => a - b);
      }
      if (finalOuts.length > finalIns.length && virtualIn != null) {
        const missing = finalOuts.length - finalIns.length;
        for (let k = 0; k < missing; k++) finalIns.unshift(virtualIn);
        finalIns.sort((a, b) => a - b);
      }
      const n = Math.min(finalIns.length, finalOuts.length);
      finalIns = finalIns.slice(0, n);
      finalOuts = finalOuts.slice(-n);

      // 6) Pair et somme - en separant confirme (les 2 sont reels Tuya) vs
      //    estime (au moins un est virtuel)
      let dayMinConfirmed = 0;
      let dayMinEstimated = 0;
      for (let k = 0; k < n; k++) {
        const inTs = finalIns[k];
        const outTs = finalOuts[k];
        if (outTs <= inTs) continue;
        const diff = outTs - inTs;
        if (diff < MIN_PAIR_MS) continue;
        const min = Math.round(diff / 60_000);
        const isRealIn = realInsSet.has(inTs);
        const isRealOut = realOutsSet.has(outTs);
        if (isRealIn && isRealOut) dayMinConfirmed += min;
        else dayMinEstimated += min;
      }
      const dayMin = dayMinConfirmed + dayMinEstimated;

      if (dayMin > 0) {
        const empMap = byEmpDay.get(empId) ?? new Map<string, DayRow>();
        empMap.set(day, { date: day, minutesConfirmed: dayMinConfirmed, minutesEstimated: dayMinEstimated, site_id: siteId });
        byEmpDay.set(empId, empMap);
        if (siteId) bySiteMinutes.set(siteId, (bySiteMinutes.get(siteId) ?? 0) + dayMin);
        byEmpMinutes.set(empId, (byEmpMinutes.get(empId) ?? 0) + dayMin);
        byEmpConfirmed.set(empId, (byEmpConfirmed.get(empId) ?? 0) + dayMinConfirmed);
        byEmpEstimated.set(empId, (byEmpEstimated.get(empId) ?? 0) + dayMinEstimated);
        totalMinutes += dayMin;
        totalConfirmed += dayMinConfirmed;
        totalEstimated += dayMinEstimated;
      }
    }
  }

  // 6. KPIs
  const activeEmps = byEmpMinutes.size;
  const avgMinPerEmp = activeEmps > 0 ? Math.round(totalMinutes / activeEmps) : 0;
  // Jours-employes uniques (pour taux presence)
  let totalDaysWorked = 0;
  for (const empMap of byEmpDay.values()) {
    totalDaysWorked += empMap.size;
  }
  // Jours dans la periode
  const fromDate = new Date(period.from + "T00:00:00");
  const toDate = new Date(period.to + "T00:00:00");
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400_000) + 1);

  // 7. Top sites
  const topSites = [...bySiteMinutes.entries()]
    .map(([sid, min]) => ({ site: siteById.get(sid)!, minutes: min }))
    .filter((x) => x.site)
    .sort((a, b) => b.minutes - a.minutes);

  // 8. Top employes
  const topEmps = [...byEmpMinutes.entries()]
    .map(([eid, min]) => ({ emp: empById.get(eid)!, minutes: min }))
    .filter((x) => x.emp)
    .sort((a, b) => b.minutes - a.minutes);

  // 9. Tableau croise employe x jour (toutes dates de la periode)
  const dates: string[] = [];
  const cur = new Date(fromDate);
  while (cur <= toDate) {
    dates.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const empRowsForTable = topEmps.slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-gold-dark" />
            Heures prestées — vue ERP
          </h1>
          <p className="text-sm text-ink-2">
            Calcul base sur clock_entries reels (IN/OUT). Periode : <span className="font-bold">{period.label}</span> · Scope :{" "}
            <span className="font-bold">{scope === "all" ? "TOUS les sites" : `Ville ${city === "anvers" ? "Anvers" : "Bruxelles"} (${cityCodes.join("+")})`}</span>
          </p>
        </div>
        <Link href="/admin" className="text-xs px-3 py-1.5 rounded-md border border-line bg-surface hover:bg-surface-2 inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
      </div>

      <HeuresFilters initial={{ view: sp.view ?? "week", date: sp.date, from: sp.from, to: sp.to, scope }} />

      {/* KPIs - separation confirme (Tuya) vs estime (auto-correction) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi
          label="Heures confirmées Tuya"
          value={fmtH(totalConfirmed)}
          icon={<Clock className="h-4 w-4 text-success" />}
          sub="IN+OUT réels"
        />
        <Kpi
          label="Heures estimées*"
          value={fmtH(totalEstimated)}
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          sub="auto-OUT ou virtuels"
          variant="amber"
        />
        <Kpi label="Total heures" value={fmtH(totalMinutes)} icon={<Clock className="h-4 w-4 text-gold-dark" />} sub={`${activeEmps} employé(s)`} />
        <Kpi label="Moy. / employé" value={fmtH(avgMinPerEmp)} icon={<TrendingUp className="h-4 w-4 text-info" />} sub={`sur ${periodDays} jour(s)`} />
        <Kpi label="Jours-employés" value={String(totalDaysWorked)} icon={<Users className="h-4 w-4 text-success" />} sub="jours travaillés" />
      </div>
      <div className="text-[11px] text-amber-700 italic px-1">
        * Les heures estimées proviennent d'auto-fermetures (IN sans OUT Tuya). À valider par RH dans /planning/employees/[id]/prestations.
      </div>

      {/* Top sites + Top employes cote a cote */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <div className="px-3 py-2 border-b border-line flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gold-dark" />
            <h2 className="font-bold text-sm">Heures par site</h2>
          </div>
          <div className="p-2 space-y-1">
            {topSites.length === 0 ? (
              <div className="text-sm text-ink-3 px-2 py-3">Aucune heure prestée sur la période.</div>
            ) : topSites.map((row) => {
              const pct = totalMinutes > 0 ? Math.round((row.minutes / totalMinutes) * 100) : 0;
              return (
                <Link
                  key={row.site.id}
                  href={`/planning/sites/${row.site.code}`}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2 rounded"
                >
                  <span className="inline-flex w-7 h-7 rounded items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: row.site.color ?? "#666" }}>
                    {row.site.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{row.site.name}</div>
                    <div className="mt-1 h-1.5 bg-surface-2 rounded overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-sm font-bold">{fmtH(row.minutes)}</div>
                    <div className="text-[10px] text-ink-3">{pct}%</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="px-3 py-2 border-b border-line flex items-center gap-2">
            <Users className="h-4 w-4 text-info" />
            <h2 className="font-bold text-sm">Top employés (heures)</h2>
          </div>
          <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
            {topEmps.length === 0 ? (
              <div className="text-sm text-ink-3 px-2 py-3">Aucun employé sur la période.</div>
            ) : topEmps.slice(0, 25).map((row, idx) => {
              const max = topEmps[0]?.minutes ?? 1;
              const pct = max > 0 ? Math.round((row.minutes / max) * 100) : 0;
              return (
                <Link
                  key={row.emp.id}
                  href={`/planning/employees/${row.emp.id}/prestations?view=custom&from=${period.from}&to=${period.to}`}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2 rounded"
                >
                  <span className="w-6 text-right text-[10px] font-bold text-ink-3 tabular-nums">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate text-blue-700">{row.emp.full_name}</div>
                    <div className="mt-1 h-1.5 bg-surface-2 rounded overflow-hidden">
                      <div className="h-full bg-info" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">{fmtH(row.minutes)}</div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Tableau croise employe x jour */}
      <Card>
        <div className="px-3 py-2 border-b border-line flex items-center gap-2">
          <Clock className="h-4 w-4 text-gold-dark" />
          <h2 className="font-bold text-sm">Tableau croisé — employés × jours</h2>
          <span className="text-[10px] text-ink-3 ml-auto">
            {empRowsForTable.length} employé(s) × {dates.length} jour(s)
          </span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-line">
                <th className="text-left px-2 py-1.5 sticky left-0 bg-surface z-20 min-w-[180px]">Employé</th>
                {dates.map((d) => {
                  const dow = new Date(d + "T00:00:00").getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={d} className={`px-1.5 py-1.5 text-center min-w-[58px] ${isWeekend ? "bg-surface-2" : ""}`}>
                      <div className="text-[9px] text-ink-3">{["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][dow]}</div>
                      <div className="font-mono text-[10px]">{d.slice(5)}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-1.5 text-right bg-gold/10 min-w-[70px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {empRowsForTable.map(({ emp }) => {
                const empMap = byEmpDay.get(emp.id) ?? new Map();
                const total = byEmpMinutes.get(emp.id) ?? 0;
                return (
                  <tr key={emp.id} className="border-b border-line hover:bg-surface-2">
                    <td className="px-2 py-1 sticky left-0 bg-surface group-hover:bg-surface-2 truncate max-w-[180px]">
                      <Link href={`/planning/employees/${emp.id}/prestations?view=custom&from=${period.from}&to=${period.to}`} className="text-blue-700 font-bold">
                        {emp.full_name}
                      </Link>
                    </td>
                    {dates.map((d) => {
                      const row = empMap.get(d);
                      const min = (row?.minutesConfirmed ?? 0) + (row?.minutesEstimated ?? 0);
                      const hasEstimated = (row?.minutesEstimated ?? 0) > 0;
                      const dow = new Date(d + "T00:00:00").getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <td
                          key={d}
                          className={`px-1 py-1 text-center tabular-nums ${isWeekend ? "bg-surface-2/40" : ""} ${min > 0 ? "font-bold" : "text-ink-3"} ${hasEstimated ? "text-amber-700 italic" : ""}`}
                          title={hasEstimated ? "Inclut des heures estimées (auto-OUT)" : undefined}
                        >
                          {min > 0 ? fmtH(min) + (hasEstimated ? "*" : "") : "·"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-bold tabular-nums bg-gold/5">{fmtH(total)}</td>
                  </tr>
                );
              })}
              {/* Ligne TOTAL par jour */}
              <tr className="border-t-2 border-line bg-gold/10 font-bold">
                <td className="px-2 py-1.5 sticky left-0 bg-gold/10">TOTAL ({empRowsForTable.length})</td>
                {dates.map((d) => {
                  let dayTotal = 0;
                  for (const { emp } of empRowsForTable) {
                    const empMap = byEmpDay.get(emp.id);
                    const r = empMap?.get(d);
                    dayTotal += (r?.minutesConfirmed ?? 0) + (r?.minutesEstimated ?? 0);
                  }
                  return (
                    <td key={d} className="px-1 py-1.5 text-center tabular-nums">
                      {dayTotal > 0 ? fmtH(dayTotal) : "·"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums bg-gold/20">{fmtH(totalMinutes)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, icon, variant }: { label: string; value: string; sub?: string; icon?: React.ReactNode; variant?: "amber" }) {
  const valueColor = variant === "amber" ? "text-amber-700 italic" : "";
  return (
    <Card className={variant === "amber" ? "border-amber-300 bg-amber-50/30" : ""}>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-ink-3">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${valueColor}`}>{value}</div>
        {sub ? <div className="text-[10px] text-ink-3 mt-0.5">{sub}</div> : null}
      </div>
    </Card>
  );
}
