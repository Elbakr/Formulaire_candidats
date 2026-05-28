import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron toutes les 15 min (Karim 2026-05-24) - detecte les employes qui ont
 * pointe IN mais pas OUT, et auto-OUT 1h apres shift.end_time. L auto-OUT n est
 * effectue QUE si on est dans la fenetre +-30 min autour des heures d ouverture
 * du site (open_time-30min .. close_time+30min) - sauf pour les IN tres anciens
 * (>24h) ou on auto-OUT inconditionnellement.
 *
 * Source du clock_entries OUT cree : source='auto_close', auto_clocked_out=true.
 * Alerte HR : insert dans notifications pour tous les admin/rh.
 *
 * A configurer dans vercel.json :
 *   { "path": "/api/cron/tuya-auto-out", "schedule": "{$asterisk}/15 {$asterisk} {$asterisk} {$asterisk} {$asterisk}" }
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowMs = now.getTime();

  // 1) Tous les clock_entries IN des 30 derniers jours qui n ont pas encore d OUT
  //    associe (meme employee, meme shift_id, kind='out', occurred_at > IN).
  //    Karim 2026-05-26 : etendu de 7j a 30j car des IN orphans s accumulaient
  //    au-dela de la fenetre 7j (Fadoua 18/05, sarah ely 19/05, khadija 21/05,
  //    Samya 23/05, Demo 12/05). Les IN >24h dans le passe sont force-closes
  //    inconditionnellement.
  const since = new Date(nowMs - 30 * 86400_000).toISOString();
  const { data: insRaw } = await admin
    .from("clock_entries")
    .select("id, employee_id, shift_id, site_id, occurred_at, source")
    .eq("kind", "in")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false });

  type ClockIn = {
    id: string;
    employee_id: string;
    shift_id: string | null;
    site_id: string | null;
    occurred_at: string;
    source: string | null;
  };
  const ins = (insRaw ?? []) as ClockIn[];
  if (ins.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, auto_closed: 0, skipped: 0 });
  }

  // Karim 2026-05-24 : dedupe par (employee, shift_id) si shift_id existe,
  // SINON par (employee, JOUR du IN). Sans ca, les IN orphelins de jours
  // differents s ecrasaient (seul le dernier IN sans shift par employee
  // etait traite, et les vieux IN restaient ouverts pour toujours).
  function inKey(e: { employee_id: string; shift_id: string | null; occurred_at: string }) {
    if (e.shift_id) return `${e.employee_id}|${e.shift_id}`;
    const day = e.occurred_at.slice(0, 10);
    return `${e.employee_id}|noshift|${day}`;
  }

  const latestInByKey = new Map<string, ClockIn>();
  for (const e of ins) {
    const key = inKey(e);
    if (!latestInByKey.has(key)) latestInByKey.set(key, e);
  }
  const candidates = [...latestInByKey.values()];

  // 2) Recupere les OUT existants pour ces candidates
  const empIds = [...new Set(candidates.map((c) => c.employee_id))];
  const { data: outsRaw } = await admin
    .from("clock_entries")
    .select("employee_id, shift_id, occurred_at")
    .eq("kind", "out")
    .in("employee_id", empIds)
    .gte("occurred_at", since);
  type ClockOut = { employee_id: string; shift_id: string | null; occurred_at: string };
  const outs = (outsRaw ?? []) as ClockOut[];

  const outIndex = new Map<string, string>(); // key -> max occurred_at
  for (const o of outs) {
    const k = inKey(o);
    const prev = outIndex.get(k);
    if (!prev || o.occurred_at > prev) outIndex.set(k, o.occurred_at);
  }

  // 3) Filtre : IN sans OUT posterieur
  // Karim 2026-05-26 : on filtre AUSSI les IN qui ont au moins UN OUT le meme
  // jour APRES eux (peu importe le shift). Cas Omaima 25/05 : son OUT vrai a
  // 19:05 etait suivi d un IN parasite a 19:05:57 (fausse manip). L ancienne
  // logique creait un auto-OUT a 19:40 car l IN parasite n avait pas d OUT
  // associe. Nouvelle logique : si un OUT existe le meme jour APRES le IN, on
  // considere le shift comme cloture (pas d auto-OUT).
  const openIns = candidates.filter((c) => {
    const cDay = c.occurred_at.slice(0, 10);
    const cTs = new Date(c.occurred_at).getTime();
    // Cherche dans outs s il y a un OUT >= IN le meme jour pour cet employee
    const sameDayOutAfter = outs.find(
      (o) => o.employee_id === c.employee_id
        && o.occurred_at.slice(0, 10) === cDay
        && new Date(o.occurred_at).getTime() >= cTs,
    );
    return !sameDayOutAfter;
  });

  if (openIns.length === 0) {
    return NextResponse.json({ ok: true, scanned: candidates.length, auto_closed: 0, skipped: 0 });
  }

  // 4) Recupere shifts + sites pour les opens
  const shiftIds = [...new Set(openIns.map((c) => c.shift_id).filter((x): x is string => Boolean(x)))];
  const { data: shiftsRaw } = shiftIds.length
    ? await admin.from("shifts").select("id, employee_id, site_id, date, start_time, end_time").in("id", shiftIds)
    : { data: [] };
  type Shift = { id: string; employee_id: string; site_id: string; date: string; start_time: string; end_time: string };
  const shifts = (shiftsRaw ?? []) as Shift[];
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  // 5) Recupere site_needs pour calculer open/close du jour de chaque site
  const siteIdsToFetch = [...new Set(
    [...shifts.map((s) => s.site_id), ...openIns.map((c) => c.site_id).filter((x): x is string => Boolean(x))]
  )];
  const { data: needsRaw } = siteIdsToFetch.length
    ? await admin.from("site_needs")
        .select("site_id, day_of_week, start_time, end_time, is_enabled")
        .in("site_id", siteIdsToFetch)
        .eq("is_enabled", true)
    : { data: [] };
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

  // 6) Pour chaque IN ouvert, decide si on auto-OUT.
  // Karim 2026-05-24 : auto-OUT a l heure de FERMETURE du site (+ 30 min)
  // peu importe l heure courante. Si pas de site ou pas d horaires, fallback
  // sur shift.end_time + 1h. Si pas de shift, garde-fou 9h apres le IN.
  const closed: Array<{ employee_id: string; shift_id: string | null; out_ts: string; reason: string }> = [];
  const skipped: Array<{ employee_id: string; reason: string }> = [];
  for (const c of openIns) {
    const shift = c.shift_id ? shiftById.get(c.shift_id) : undefined;
    const inDateISO = new Date(c.occurred_at).toISOString().slice(0, 10);
    const siteId = shift?.site_id ?? c.site_id;

    // 1. Cherche close_time du site pour le JOUR du IN (pas aujourd hui)
    let deadlineMs: number | null = null;
    let outTs: string;
    let reasonLabel: string;
    if (siteId) {
      const hours = siteHoursFor(siteId, inDateISO);
      if (hours) {
        // close + 30 min de tolerance
        deadlineMs = new Date(`${inDateISO}T${hours.close}:00`).getTime() + 30 * 60_000;
        outTs = new Date(`${inDateISO}T${hours.close}:00`).toISOString();
        reasonLabel = `Auto-OUT a fermeture site (${hours.close})`;
      }
    }

    // 2. Fallback : shift.end_time + 1h
    if (deadlineMs === null && shift) {
      const endTs = new Date(`${shift.date}T${shift.end_time}`).getTime();
      deadlineMs = endTs + 60 * 60_000;
      outTs = new Date(deadlineMs).toISOString();
      reasonLabel = `Auto-OUT 1h apres fin de shift (${shift.end_time})`;
    }

    // 3. Garde-fou : pas de shift et pas d horaires site -> 9h apres IN
    if (deadlineMs === null) {
      deadlineMs = new Date(c.occurred_at).getTime() + 9 * 3600_000;
      outTs = new Date(deadlineMs).toISOString();
      reasonLabel = `Auto-OUT 9h apres IN (pas de shift ni horaires site)`;
    }

    // Karim 2026-05-26 : force-close inconditionnel pour les IN > 24h
    // (sinon les orphans anciens restent ouverts a vie et bloquent les
    // nouveaux IN via le trigger prevent_double_clock_in).
    const inAgeMs = nowMs - new Date(c.occurred_at).getTime();
    const isVeryOld = inAgeMs > 24 * 3600_000;
    if (nowMs < deadlineMs && !isVeryOld) {
      skipped.push({ employee_id: c.employee_id, reason: "deadline pas atteinte" });
      continue;
    }
    if (isVeryOld && nowMs < deadlineMs) {
      // IN tres vieux : on prend le min(close_time, IN+2.5h) pour ne pas
      // surevaluer artificiellement les heures
      const fallback = new Date(c.occurred_at).getTime() + 2.5 * 3600_000;
      if (fallback < deadlineMs) {
        outTs = new Date(fallback).toISOString();
        reasonLabel = `Force-close orphan >24h (estimation IN +2h30)`;
      } else {
        reasonLabel = `Force-close orphan >24h (close_time site)`;
      }
    }

    const { error } = await admin.from("clock_entries").insert({
      employee_id: c.employee_id,
      shift_id: c.shift_id,
      site_id: siteId,
      kind: "out",
      occurred_at: outTs!,
      entry_method: "auto_shift",
      source: "auto_close",
      auto_clocked_out: true,
      notes: reasonLabel!,
    });
    if (error) {
      skipped.push({ employee_id: c.employee_id, reason: `insert: ${error.message}` });
      continue;
    }
    closed.push({
      employee_id: c.employee_id,
      shift_id: c.shift_id,
      out_ts: outTs!,
      reason: reasonLabel!,
    });
  }

  // 7) Alerte HR : 1 notification groupee aux admins/rh si au moins 1 auto-close
  if (closed.length > 0) {
    const { data: empsRaw } = await admin
      .from("employees")
      .select("id, full_name")
      .in("id", [...new Set(closed.map((x) => x.employee_id))]);
    const empById = new Map(((empsRaw ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));

    const { data: hrsRaw } = await admin
      .from("profiles")
      .select("id, role")
      .in("role", ["admin", "rh"]);
    const hrs = ((hrsRaw ?? []) as Array<{ id: string; role: string }>).map((p) => p.id);

    if (hrs.length > 0) {
      const names = closed
        .slice(0, 5)
        .map((x) => empById.get(x.employee_id) ?? "?")
        .join(", ");
      const extra = closed.length > 5 ? ` (+${closed.length - 5} autres)` : "";
      const inserts = hrs.map((hrId) => ({
        recipient_id: hrId,
        kind: "tuya_auto_close",
        title: `Auto-OUT pointage : ${closed.length} employé(s)`,
        body: `${names}${extra} n'ont pas pointé OUT à la fin de leur shift. Auto-fermé. Vérifie /admin/presence.`,
        link: "/admin/presence",
        data: { count: closed.length, employees: closed.map((x) => x.employee_id) },
      }));
      await admin.from("notifications").insert(inserts);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    open_ins: openIns.length,
    auto_closed: closed.length,
    skipped: skipped.length,
    skipped_reasons: skipped.slice(0, 5),
  });
}
