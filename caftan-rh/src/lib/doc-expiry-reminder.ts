import "server-only";

// Karim 2026-07-11 : rappels ÉCHELONNÉS d'expiration des documents (titre de
// séjour de la fiche + documents de la valise : Limosa, A1…). Paliers 45 / 30 /
// 15 / 7 jours + DATE LIMITE. Message : « mets à jour tes documents pour poursuivre
// le travail ». Détection = cron (notifie l'admin au franchissement d'un palier) ;
// envoi MANUEL 1-clic au travailleur (jamais `automated` -> passe le kill-switch).

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAppMail } from "@/lib/app-mail";

export const MAX_WINDOW_DAYS = 45;

export type ExpiringItem = { label: string; expiry: string; days: number };

function brusselsToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso.slice(0, 10) + "T00:00:00Z") - Date.parse(brusselsToday() + "T00:00:00Z")) / 86_400_000);
}
function firstNameOf(full: string | null): string {
  const n = (full ?? "").trim();
  return n ? n.split(/\s+/)[0] : "";
}
const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const NL_MONTHS = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function fmtDate(iso: string, lang: "fr" | "nl"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${(lang === "nl" ? NL_MONTHS : FR_MONTHS)[(m || 1) - 1]} ${y}`;
}

/** Palier (1..5) selon le min de jours avant expiration ; 0 = pas encore concerné.
 *  1=≤45, 2=≤30, 3=≤15, 4=≤7, 5=échéance atteinte (≤0). */
export function stageForDays(minDays: number): number {
  if (minDays <= 0) return 5;
  if (minDays <= 7) return 4;
  if (minDays <= 15) return 3;
  if (minDays <= 30) return 2;
  if (minDays <= 45) return 1;
  return 0;
}

/** Items expirants (≤45 j, jusqu'à ~échéance) d'un employé : titre de séjour + valise. */
export async function getEmployeeExpiringItems(
  admin: SupabaseClient,
  employeeId: string,
): Promise<{
  email: string | null;
  name: string | null;
  lang: "fr" | "nl";
  items: ExpiringItem[];
  stage: number;
}> {
  const { data: eRaw } = await admin
    .from("employees")
    .select("full_name, email, preferred_language, residence_doc_type, residence_doc_expiry")
    .eq("id", employeeId)
    .maybeSingle();
  const e = eRaw as {
    full_name: string | null;
    email: string | null;
    preferred_language: string | null;
    residence_doc_type: string | null;
    residence_doc_expiry: string | null;
  } | null;

  const today = brusselsToday();
  const within = addDaysISO(today, MAX_WINDOW_DAYS);
  // Karim 2026-07-11 : sur la FICHE (envoi manuel), on inclut AUSSI les titres déjà
  // expirés depuis longtemps (un titre expiré reste une situation à régulariser). Le
  // plancher -7 j précédent bloquait l'envoi pour une carte expirée depuis des mois.
  const floor = addDaysISO(today, -3650);

  const items: ExpiringItem[] = [];
  if (e?.residence_doc_expiry && e.residence_doc_expiry <= within && e.residence_doc_expiry >= floor) {
    items.push({
      label: e.residence_doc_type === "titre_sejour" ? "Titre de séjour" : "Carte d'identité",
      expiry: e.residence_doc_expiry.slice(0, 10),
      days: daysUntil(e.residence_doc_expiry),
    });
  }
  const { data: docs } = await admin
    .from("documents")
    .select("file_name, kind, expiry_date")
    .eq("employee_id", employeeId)
    .not("expiry_date", "is", null)
    .lte("expiry_date", within)
    .gte("expiry_date", floor);
  for (const doc of (docs ?? []) as Array<{ file_name: string | null; kind: string | null; expiry_date: string }>) {
    items.push({
      label: doc.file_name || doc.kind || "Document",
      expiry: doc.expiry_date.slice(0, 10),
      days: daysUntil(doc.expiry_date),
    });
  }

  const minDays = items.length ? Math.min(...items.map((i) => i.days)) : 999;
  return {
    email: e?.email ?? null,
    name: e?.full_name ?? null,
    lang: e?.preferred_language === "nl" ? "nl" : "fr",
    items,
    stage: stageForDays(minDays),
  };
}

export function buildReminderCopy(
  name: string | null,
  items: ExpiringItem[],
  lang: "fr" | "nl",
): { subject: string; body: string } {
  const first = firstNameOf(name);
  const minDays = Math.min(...items.map((i) => i.days));
  const deadline = minDays <= 0;
  const urgent = minDays <= 7;

  if (lang === "nl") {
    const list = items
      .map((i) => `- ${i.label} : ${fmtDate(i.expiry, "nl")} (${i.days <= 0 ? "vervallen" : `over ${i.days} d`})`)
      .join("\n");
    return {
      subject: deadline ? "Actie vereist — documenten bijwerken" : `Herinnering: documenten bijwerken (${minDays} d)`,
      body:
        `Beste ${first || "collega"},\n\n` +
        `${urgent ? "⚠️ " : ""}Om te kunnen BLIJVEN WERKEN, moeten de volgende documenten geldig blijven :\n\n${list}\n\n` +
        `Gelieve ze ${deadline ? "ONMIDDELLIJK" : "tijdig"} te vernieuwen en ons een kopie te bezorgen. ` +
        `Zonder geldig document is verder werken niet mogelijk.\n\n` +
        `Hulp nodig? We staan voor je klaar.\n\nMet vriendelijke groet,\nCaftan Factory Group — Human Resources`,
    };
  }
  const list = items
    .map((i) => `- ${i.label} : ${fmtDate(i.expiry, "fr")} (${i.days <= 0 ? "échéance atteinte" : `dans ${i.days} j`})`)
    .join("\n");
  return {
    subject: deadline ? "Action requise — documents à mettre à jour" : `Rappel : documents à mettre à jour (${minDays} j)`,
    body:
      `Bonjour ${first || ""},\n\n`.replace("  ", " ") +
      `${urgent ? "⚠️ " : ""}Pour pouvoir CONTINUER À TRAVAILLER, les documents suivants doivent rester valides :\n\n${list}\n\n` +
      `Merci de les renouveler ${deadline ? "IMMÉDIATEMENT" : "à temps"} et de nous transmettre une copie du document mis à jour. ` +
      `Sans document valide, la poursuite du travail n'est pas possible.\n\n` +
      `Besoin d'aide ? Nous restons à ta disposition.\n\nBien à toi,\nCaftan Factory Group — Ressources Humaines`,
  };
}

/** Envoi MANUEL (validé admin) du rappel agrégé au travailleur. Avance le palier. */
export async function sendDocExpiryReminder(
  admin: SupabaseClient,
  employeeId: string,
): Promise<{ ok: boolean; error?: string; to?: string }> {
  const p = await getEmployeeExpiringItems(admin, employeeId);
  if (!p.email) return { ok: false, error: "Aucun email sur la fiche du travailleur." };
  if (p.items.length === 0) return { ok: false, error: "Aucun document proche de l'expiration." };

  const { subject, body } = buildReminderCopy(p.name, p.items, p.lang);
  const res = await sendAppMail({
    to: p.email,
    toName: p.name ?? undefined,
    subject,
    body,
    source: "doc_expiry_reminder", // MANUEL (non `automated`) -> jamais bloqué
    employeeId,
  });
  if (res && (res as { ok?: boolean }).ok === false) {
    return { ok: false, error: (res as { error?: string }).error ?? "Échec de l'envoi." };
  }
  await admin
    .from("employees")
    .update({ residence_doc_reminder_at: new Date().toISOString(), residence_doc_reminder_stage: p.stage })
    .eq("id", employeeId);
  return { ok: true, to: p.email };
}

/** Pour le cron : employés courants avec ≥1 document proche de l'expiration, + palier. */
export async function scanExpiringEmployees(
  admin: SupabaseClient,
): Promise<Array<{ id: string; name: string | null; minDays: number; stage: number; storedStage: number }>> {
  const today = brusselsToday();
  const within = addDaysISO(today, MAX_WINDOW_DAYS);
  const floor = addDaysISO(today, -7);

  // Employés courants avec un titre de séjour proche de l'expiration.
  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, residence_doc_expiry, residence_doc_reminder_stage, end_date")
    .or(`end_date.is.null,end_date.gte.${today}`);
  const emps = ((empsRaw ?? []) as Array<{
    id: string;
    full_name: string | null;
    residence_doc_expiry: string | null;
    residence_doc_reminder_stage: number | null;
    end_date: string | null;
  }>).filter((e) => !e.end_date || e.end_date >= today);

  const minByEmp = new Map<string, number>();
  const meta = new Map<string, { name: string | null; stored: number }>();
  for (const e of emps) {
    meta.set(e.id, { name: e.full_name, stored: e.residence_doc_reminder_stage ?? 0 });
    if (e.residence_doc_expiry && e.residence_doc_expiry <= within && e.residence_doc_expiry >= floor) {
      minByEmp.set(e.id, daysUntil(e.residence_doc_expiry));
    }
  }

  // Documents de la valise (employés) avec expiration proche.
  const empIds = emps.map((e) => e.id);
  if (empIds.length) {
    const { data: docs } = await admin
      .from("documents")
      .select("employee_id, expiry_date")
      .in("employee_id", empIds)
      .not("expiry_date", "is", null)
      .lte("expiry_date", within)
      .gte("expiry_date", floor);
    for (const d of (docs ?? []) as Array<{ employee_id: string; expiry_date: string }>) {
      const dday = daysUntil(d.expiry_date);
      const cur = minByEmp.get(d.employee_id);
      if (cur == null || dday < cur) minByEmp.set(d.employee_id, dday);
    }
  }

  const out: Array<{ id: string; name: string | null; minDays: number; stage: number; storedStage: number }> = [];
  for (const [id, minDays] of minByEmp) {
    const m = meta.get(id);
    out.push({ id, name: m?.name ?? null, minDays, stage: stageForDays(minDays), storedStage: m?.stored ?? 0 });
  }
  return out;
}
