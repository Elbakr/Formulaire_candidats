import "server-only";

// Karim 2026-07-12 : moteur d'envoi du PROGRAMME DE FORMATION (grand manuel gamifié).
// 1re section jour 1 à 9h puis chaque jour à 9h (rythme `daily`) OU étalé sur 30 j
// (`spread30`) — au choix du travailleur. Le bouton « Hâte d'apprendre » envoie la
// suivante tout de suite. Envoi AUTO assumé (source whitelistée). Bilingue FR/NL.

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOutboundBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";

export const TRAINING_SOURCE = "training_drip";

type Enrollment = {
  id: string;
  token: string;
  started_on: string;
  rhythm: string;
  current_seq: number;
  status: string;
  completed_at: string | null;
};

function firstName(full: string | null): string {
  const n = (full ?? "").trim();
  return n ? n.split(/\s+/)[0] : "";
}

/** Prochain 09:00 heure de Bruxelles strictement après `after` (robuste DST). */
function next9hBrussels(after: Date): Date {
  for (let d = 0; d < 4; d++) {
    const day = new Date(after);
    day.setUTCDate(day.getUTCDate() + d);
    for (let h = 0; h < 24; h++) {
      const cand = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, 0, 0));
      const hourBxl = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(cand),
      );
      if (hourBxl === 9 && cand > after) return cand;
    }
  }
  return new Date(after.getTime() + 24 * 3600 * 1000);
}

export async function moduleCount(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("training_modules").select("seq").eq("is_active", true).order("seq", { ascending: false }).limit(1).maybeSingle();
  return (data as { seq: number } | null)?.seq ?? 0;
}

/** Crée l'inscription si absente (token durable, started_on = start_date ou aujourd'hui). */
export async function ensureEnrollment(admin: SupabaseClient, employeeId: string): Promise<Enrollment | null> {
  const { data: existing } = await admin.from("training_enrollments").select("*").eq("employee_id", employeeId).maybeSingle();
  if (existing) return existing as Enrollment;

  const { data: emp } = await admin.from("employees").select("start_date").eq("id", employeeId).maybeSingle();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const started = (emp as { start_date: string | null } | null)?.start_date?.slice(0, 10);
  const startedOn = started && started > today ? started : today; // pas avant la prise de service
  const token = crypto.randomBytes(20).toString("base64url");

  const { data, error } = await admin
    .from("training_enrollments")
    .insert({ employee_id: employeeId, token, started_on: startedOn, rhythm: "daily", current_seq: 0, status: "active" })
    .select("*")
    .maybeSingle();
  if (error) return null;
  return data as Enrollment;
}

function intervalDays(rhythm: string, total: number): number {
  if (rhythm === "spread30" && total > 0) return Math.max(1, Math.round(30 / total));
  return 1;
}

/** Envoie la section `seq` au travailleur + programme la suivante. Marque terminé si
 *  aucune section à `seq`. Retour {ok, done?}. */
export async function sendTrainingModule(
  admin: SupabaseClient,
  employeeId: string,
  seq: number,
): Promise<{ ok: boolean; done?: boolean; error?: string }> {
  const enr = await ensureEnrollment(admin, employeeId);
  if (!enr) return { ok: false, error: "inscription impossible" };

  const { data: modRaw } = await admin
    .from("training_modules")
    .select("seq, kind, title_fr, title_nl, exam_level")
    .eq("seq", seq)
    .eq("is_active", true)
    .maybeSingle();
  const mod = modRaw as { seq: number; kind: string; title_fr: string; title_nl: string | null; exam_level: number | null } | null;

  if (!mod) {
    // Plus de section -> formation terminée.
    await admin.from("training_enrollments").update({ status: "done", completed_at: new Date().toISOString(), next_send_at: null }).eq("employee_id", employeeId);
    return { ok: true, done: true };
  }

  const { data: emp } = await admin.from("employees").select("email, full_name, preferred_language").eq("id", employeeId).maybeSingle();
  const e = emp as { email: string | null; full_name: string | null; preferred_language: string | null } | null;
  if (!e?.email) return { ok: false, error: "pas d'email travailleur" };
  const lang: "fr" | "nl" = e.preferred_language === "nl" ? "nl" : "fr";
  const prenom = firstName(e.full_name);
  const link = `${getOutboundBaseUrl()}/former/${enr.token}`;
  const isExam = mod.kind === "exam";
  const title = (lang === "nl" ? mod.title_nl : mod.title_fr) || mod.title_fr;

  const subject =
    lang === "nl"
      ? isExam
        ? `Kleine toets 🧩 — ${title}`
        : `Je opleiding van vandaag 📘 — ${title}`
      : isExam
        ? `Petit examen 🧩 — ${title}`
        : `Ta formation du jour 📘 — ${title}`;
  const body =
    lang === "nl"
      ? `Hallo ${prenom || "collega"},\n\n${isExam ? "Tijd voor een kleine toets" : "Hier is je sectie van vandaag"}: « ${title} ».\n\n👉 Open ze hier (2 minuten):\n${link}\n\nVeel plezier! 🚀\nCaftan Factory Group`
      : `Bonjour ${prenom || ""},\n\n${isExam ? "C'est l'heure d'un petit examen" : "Voici ta section du jour"} : « ${title} ».\n\n👉 Ouvre-la ici (2 minutes) :\n${link}\n\nBonne lecture ! 🚀\nCaftan Factory Group`;

  const res = await sendAppMail({
    to: e.email,
    toName: e.full_name ?? undefined,
    subject,
    body,
    automated: true, // envoi AUTO assumé -> source whitelistée
    source: TRAINING_SOURCE,
    employeeId,
  });
  if (res && (res as { ok?: boolean }).ok === false) {
    return { ok: false, error: (res as { error?: string }).error ?? "envoi KO" };
  }

  // Journalise l'envoi (upsert : ne réécrase pas confirmed_at si renvoi).
  await admin.from("training_events").upsert(
    { employee_id: employeeId, module_seq: seq, sent_at: new Date().toISOString() },
    { onConflict: "employee_id,module_seq" },
  );

  const total = await moduleCount(admin);
  const step = intervalDays(enr.rhythm, total);
  const nextSend = next9hBrussels(new Date(Date.now() + (step * 24 - 1) * 3600 * 1000));
  await admin
    .from("training_enrollments")
    .update({ current_seq: seq, next_send_at: nextSend.toISOString(), status: "active" })
    .eq("employee_id", employeeId);

  return { ok: true };
}

/** Après lecture confirmée : enregistre temps de lecture + action ; envoie la suivante
 *  tout de suite si « hâte d'apprendre », sinon laisse le rythme quotidien (cron 9h). */
export async function confirmAndMaybeAdvance(
  admin: SupabaseClient,
  employeeId: string,
  seq: number,
  opts: { eager: boolean; readingSeconds: number | null },
): Promise<{ ok: boolean; done?: boolean }> {
  await admin.from("training_events").upsert(
    {
      employee_id: employeeId,
      module_seq: seq,
      confirmed_at: new Date().toISOString(),
      reading_seconds: opts.readingSeconds ?? null,
      action: opts.eager ? "eager" : "done",
    },
    { onConflict: "employee_id,module_seq" },
  );

  if (opts.eager) {
    return await sendTrainingModule(admin, employeeId, seq + 1);
  }
  // Rythme quotidien : la suivante partira au prochain 9h (cron). On s'assure juste
  // que next_send_at est bien programmé.
  const { data } = await admin.from("training_enrollments").select("next_send_at, current_seq").eq("employee_id", employeeId).maybeSingle();
  const enr = data as { next_send_at: string | null; current_seq: number } | null;
  if (enr && !enr.next_send_at) {
    const next = next9hBrussels(new Date());
    await admin.from("training_enrollments").update({ next_send_at: next.toISOString() }).eq("employee_id", employeeId);
  }
  return { ok: true };
}
