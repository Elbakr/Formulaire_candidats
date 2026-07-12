import "server-only";

// Karim 2026-07-12 : moteur d'envoi du PROGRAMME DE FORMATION (grand manuel gamifié).
// 1re section jour 1 à 9h puis chaque jour à 9h (rythme `daily`) OU étalé sur 30 j
// (`spread30`) — au choix du travailleur. Le bouton « Hâte d'apprendre » envoie la
// suivante tout de suite. Envoi AUTO assumé (source whitelistée). Bilingue FR/NL.

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNeutralBaseUrl } from "@/lib/public-base-url";
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

  const { data: emp } = await admin.from("employees").select("email, full_name, preferred_language, end_date, status").eq("id", employeeId).maybeSingle();
  const e = emp as { email: string | null; full_name: string | null; preferred_language: string | null; end_date: string | null; status: string | null } | null;
  if (!e?.email) return { ok: false, error: "pas d'email travailleur" };

  // Karim 2026-07-12 : plus AUCUN envoi après le terme du contrat (le lien meurt).
  const todayBxl = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  if ((e.end_date && e.end_date.slice(0, 10) < todayBxl) || e.status === "archived") {
    await admin.from("training_enrollments").update({ status: "expired", next_send_at: null }).eq("employee_id", employeeId);
    return { ok: false, error: "contrat terminé — lien clôturé" };
  }
  const lang: "fr" | "nl" = e.preferred_language === "nl" ? "nl" : "fr";
  const prenom = firstName(e.full_name);
  const link = `${getNeutralBaseUrl()}/former/${enr.token}`;
  const isExam = mod.kind === "exam";
  const title = (lang === "nl" ? mod.title_nl : mod.title_fr) || mod.title_fr;

  const nameSuffix = prenom ? `, ${prenom}` : "";
  const subject =
    lang === "nl"
      ? isExam
        ? `🧩 Klein uitdaginkje voor jou — ${title}`
        : `📘 Je opleiding van vandaag is er${nameSuffix} !`
      : isExam
        ? `🧩 Un petit défi rien que pour toi — ${title}`
        : `📘 Ta formation du jour est arrivée${nameSuffix} !`;

  const c = lang === "nl"
    ? {
        hi: `Hallo ${prenom || "collega"},`,
        lead: isExam
          ? "Klaar voor een klein, leuk uitdaginkje? 🧩 Het helpt je vooruit — geen stress, gewoon eerlijk antwoorden."
          : "Fijn dat je er bent! 🎉 Hier is je korte sectie van vandaag — concreet en meteen bruikbaar in de winkel.",
        card: title,
        cta: isExam ? "De toets starten" : "Mijn sectie openen",
        ps: "Duurt maar 2 minuten. Veel plezier! 🚀",
        sign: "Het team van Caftan Factory Group",
      }
    : {
        hi: prenom ? `Bonjour ${prenom},` : "Bonjour,",
        lead: isExam
          ? "Prêt(e) pour un petit défi sympa ? 🧩 Ça t'aide à progresser — pas de stress, réponds simplement avec sincérité."
          : "Content(e) de t'accompagner ! 🎉 Voici ta courte section du jour — concrète et utile tout de suite en magasin.",
        card: title,
        cta: isExam ? "Commencer l'examen" : "Ouvrir ma section",
        ps: "Ça te prend 2 minutes. Bonne lecture ! 🚀",
        sign: "L'équipe Caftan Factory Group",
      };

  const htmlBody = `<div style="margin:0;padding:0;background:#f6f5f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#1a1a1a;padding:22px 28px;"><div style="color:#c8a24a;font-weight:800;font-size:13px;letter-spacing:.5px;">CAFTAN FACTORY — FORMATION</div><div style="color:#ffffff;font-size:20px;font-weight:800;margin-top:4px;">🎓 ${title}</div></td></tr>
<tr><td style="padding:24px 28px 8px;color:#1a1a1a;font-size:15px;line-height:1.5;">
<p style="margin:0 0 10px;">${c.hi}</p>
<p style="margin:0 0 18px;color:#444;">${c.lead}</p>
<div style="text-align:center;margin:22px 0;">
<a href="${link}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:10px;">${c.cta} →</a>
</div>
<p style="margin:10px 0 0;color:#888;font-size:13px;text-align:center;">${c.ps}</p>
</td></tr>
<tr><td style="padding:16px 28px 26px;color:#999;font-size:13px;">${c.sign} 💛</td></tr>
</table>
<div style="max-width:480px;color:#b8b8b8;font-size:11px;margin-top:12px;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">Ce lien t'est personnel et lié à ton téléphone.</div>
</td></tr></table></div>`;

  const body =
    lang === "nl"
      ? `${c.hi}\n\n${c.lead}\n\n${c.cta}: ${link}\n\n${c.ps}\n${c.sign}`
      : `${c.hi}\n\n${c.lead}\n\n${c.cta} : ${link}\n\n${c.ps}\n${c.sign}`;

  const res = await sendAppMail({
    to: e.email,
    toName: e.full_name ?? undefined,
    subject,
    body,
    htmlBody,
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
