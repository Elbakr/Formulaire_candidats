import "server-only";

// Karim 2026-07-11 : rappel d'expiration du titre de séjour / carte d'identité.
// Détection 45 j avant l'expiration (pendant le contrat) -> notif admin pour
// VALIDATION -> envoi MANUEL 1-clic au travailleur (jamais automatique : on ne
// tague PAS `automated`, donc le kill-switch outbound ne s'applique pas).

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAppMail } from "@/lib/app-mail";

export const DOC_EXPIRY_WINDOW_DAYS = 45;

export type ExpiringWorker = {
  id: string;
  full_name: string | null;
  email: string | null;
  residence_doc_expiry: string; // "YYYY-MM-DD"
  residence_doc_type: string | null;
  residence_doc_reminder_at: string | null;
  preferred_language: string | null;
};

function brusselsToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function firstNameOf(full: string | null): string {
  const n = (full ?? "").trim();
  return n ? n.split(/\s+/)[0] : "";
}
const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const NL_MONTHS = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function fmtDate(iso: string, lang: "fr" | "nl"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = lang === "nl" ? NL_MONTHS : FR_MONTHS;
  return `${d} ${months[(m || 1) - 1]} ${y}`;
}
export function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(brusselsToday() + "T00:00:00Z")) / 86_400_000);
}

/** Travailleurs COURANTS dont le titre/CI expire dans ≤ `withinDays` (et pas encore expiré). */
export async function findExpiringWorkers(
  admin: SupabaseClient,
  withinDays = DOC_EXPIRY_WINDOW_DAYS,
): Promise<ExpiringWorker[]> {
  const today = brusselsToday();
  const limit = addDaysISO(today, withinDays);
  const { data } = await admin
    .from("employees")
    .select(
      "id, full_name, email, residence_doc_expiry, residence_doc_type, residence_doc_reminder_at, preferred_language, end_date",
    )
    .not("residence_doc_expiry", "is", null)
    .gte("residence_doc_expiry", today)
    .lte("residence_doc_expiry", limit);
  return ((data ?? []) as Array<ExpiringWorker & { end_date: string | null }>)
    .filter((w) => !w.end_date || w.end_date >= today)
    .map(({ end_date, ...w }) => w); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Copie du mail (bilingue FR/NL), ton « bon père de famille » : bienveillant, clair, actionnable. */
export function buildDocExpiryReminderCopy(
  fullName: string | null,
  expiryISO: string,
  docType: string | null,
  lang: "fr" | "nl",
): { subject: string; body: string } {
  const first = firstNameOf(fullName);
  const dateStr = fmtDate(expiryISO, lang);
  if (lang === "nl") {
    const doc = docType === "titre_sejour" ? "verblijfstitel" : "identiteitskaart";
    return {
      subject: `Herinnering: je ${doc} verloopt binnenkort (${dateStr})`,
      body:
        `Beste ${first || "collega"},\n\n` +
        `We willen je vriendelijk laten weten dat je ${doc} verloopt op ${dateStr}.\n\n` +
        `Om ervoor te zorgen dat alles in orde blijft tijdens je contract, vragen we je om je document tijdig te vernieuwen ` +
        `en ons daarna een kopie te bezorgen. Zo vermijden we samen elk probleem.\n\n` +
        `Heb je hulp of vragen nodig? We staan voor je klaar.\n\n` +
        `Met vriendelijke groet,\nCaftan Factory Group — Human Resources`,
    };
  }
  const doc = docType === "titre_sejour" ? "titre de séjour" : "carte d'identité";
  return {
    subject: `Rappel : ton ${doc} arrive à expiration (${dateStr})`,
    body:
      `Bonjour ${first || ""},\n\n`.replace("  ", " ") +
      `Nous t'informons avec bienveillance que ton ${doc} arrive à échéance le ${dateStr}.\n\n` +
      `Afin que tout reste en règle pendant la durée de ton contrat, nous t'invitons à entamer le renouvellement ` +
      `à temps, puis à nous transmettre une copie du document renouvelé. Nous éviterons ainsi ensemble toute difficulté.\n\n` +
      `Besoin d'aide ou d'informations ? Nous restons à ta disposition.\n\n` +
      `Bien à toi,\nCaftan Factory Group — Ressources Humaines`,
  };
}

/** Envoi MANUEL (validé par l'admin) du rappel au travailleur. */
export async function sendDocExpiryReminder(
  admin: SupabaseClient,
  employeeId: string,
): Promise<{ ok: boolean; error?: string; to?: string }> {
  const { data: wRaw } = await admin
    .from("employees")
    .select("id, full_name, email, residence_doc_expiry, residence_doc_type, preferred_language")
    .eq("id", employeeId)
    .maybeSingle();
  const w = wRaw as {
    id: string;
    full_name: string | null;
    email: string | null;
    residence_doc_expiry: string | null;
    residence_doc_type: string | null;
    preferred_language: string | null;
  } | null;
  if (!w) return { ok: false, error: "Travailleur introuvable." };
  if (!w.email) return { ok: false, error: "Aucun email sur la fiche du travailleur." };
  if (!w.residence_doc_expiry) return { ok: false, error: "Aucune date d'expiration connue." };

  const lang = w.preferred_language === "nl" ? "nl" : "fr";
  const { subject, body } = buildDocExpiryReminderCopy(
    w.full_name,
    w.residence_doc_expiry,
    w.residence_doc_type,
    lang,
  );

  const res = await sendAppMail({
    to: w.email,
    toName: w.full_name ?? undefined,
    subject,
    body,
    source: "doc_expiry_reminder", // envoi MANUEL (non `automated`) -> jamais bloqué
    employeeId,
  });
  if (res && (res as { ok?: boolean }).ok === false) {
    return { ok: false, error: (res as { error?: string }).error ?? "Échec de l'envoi." };
  }
  await admin
    .from("employees")
    .update({ residence_doc_reminder_at: new Date().toISOString() })
    .eq("id", employeeId);
  return { ok: true, to: w.email };
}
