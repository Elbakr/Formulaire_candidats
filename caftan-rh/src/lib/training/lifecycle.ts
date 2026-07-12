import "server-only";

// Karim 2026-07-12 : cycle de vie du travailleur autour de la formation.
//  1) PRISE DE POULS tous les 15 j pour les contrats < 3 mois (ressenti au travail).
//  2) AU REVOIR + BILAN de sortie : idéalement 10-15 j avant la fin de contrat, au
//     plus tard ~3 j avant. Demande le ressenti (formation, collègues, travail,
//     salaire, horaire), la dispo future, et s'il veut REDEVENIR CANDIDAT ou pas.
// Envois AUTO assumés (sources whitelistées). Liens sur l'hôte NEUTRE.

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNeutralBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10) + "T00:00:00Z") - Date.parse(a.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
}
function firstName(full: string | null): string {
  const n = (full ?? "").trim();
  return n ? n.split(/\s+/)[0] : "";
}
function ctaEmail(opts: {
  lang: "fr" | "nl";
  banner: string;
  title: string;
  hi: string;
  lead: string;
  cta: string;
  link: string;
  sign: string;
}): { htmlBody: string; body: string } {
  const { lang, banner, title, hi, lead, cta, link, sign } = opts;
  void lang;
  const htmlBody = `<div style="margin:0;padding:0;background:#f6f5f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.06);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#1a1a1a;padding:22px 28px;"><div style="color:#c8a24a;font-weight:800;font-size:13px;letter-spacing:.5px;">${banner}</div><div style="color:#fff;font-size:20px;font-weight:800;margin-top:4px;">${title}</div></td></tr>
<tr><td style="padding:24px 28px 8px;color:#1a1a1a;font-size:15px;line-height:1.5;"><p style="margin:0 0 10px;">${hi}</p><p style="margin:0 0 18px;color:#444;">${lead}</p>
<div style="text-align:center;margin:22px 0;"><a href="${link}" style="display:inline-block;background:#c8a24a;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 30px;border-radius:10px;">${cta} →</a></div></td></tr>
<tr><td style="padding:8px 28px 26px;color:#999;font-size:13px;">${sign} 💛</td></tr>
</table></td></tr></table></div>`;
  const body = `${hi}\n\n${lead}\n\n${cta} : ${link}\n\n${sign}`;
  return { htmlBody, body };
}

type Row = {
  employee_id: string;
  token: string;
  started_on: string;
  last_sentiment_at: string | null;
  exit_survey_sent_at: string | null;
};

export type LifecycleResult = { pouls: number; exit: number; errors: string[] };

export async function runTrainingLifecycle(admin: SupabaseClient): Promise<LifecycleResult> {
  const res: LifecycleResult = { pouls: 0, exit: 0, errors: [] };
  const t = today();

  const { data: enrRaw } = await admin
    .from("training_enrollments")
    .select("employee_id, token, started_on, last_sentiment_at, exit_survey_sent_at")
    .in("status", ["active", "done"]);
  const enrs = (enrRaw ?? []) as Row[];
  if (enrs.length === 0) return res;

  const ids = enrs.map((e) => e.employee_id);
  const { data: empRaw } = await admin
    .from("employees")
    .select("id, full_name, email, preferred_language, start_date, end_date, status")
    .in("id", ids);
  const emps = new Map(
    ((empRaw ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      preferred_language: string | null;
      start_date: string | null;
      end_date: string | null;
      status: string;
    }>).map((e) => [e.id, e]),
  );

  for (const enr of enrs) {
    const e = emps.get(enr.employee_id);
    if (!e || !e.email || e.status !== "active") continue;
    const lang: "fr" | "nl" = e.preferred_language === "nl" ? "nl" : "fr";
    const prenom = firstName(e.full_name);
    const base = getNeutralBaseUrl();

    try {
      // 1) AU REVOIR / BILAN — fenêtre [fin-15 ; fin+2], une seule fois.
      if (e.end_date && !enr.exit_survey_sent_at) {
        const windowStart = addDaysISO(e.end_date, -15);
        if (t >= windowStart && t <= addDaysISO(e.end_date, 2)) {
          const token = crypto.randomBytes(20).toString("base64url");
          await admin.from("training_exit_survey").upsert(
            { employee_id: enr.employee_id, token, sent_at: new Date().toISOString() },
            { onConflict: "employee_id" },
          );
          const link = `${base}/bilan/${token}`;
          const mail =
            lang === "nl"
              ? ctaEmail({ lang, banner: "CAFTAN FACTORY", title: "🙏 Bedankt voor alles", hi: `Beste ${prenom || "collega"},`, lead: "Je contract loopt binnenkort af. We zouden heel graag je eerlijke mening horen — over je opleiding, je collega's, het werk, je loon en je uren. En laat ons weten of we in de toekomst nog op je mogen rekenen.", cta: "Mijn mening geven (2 min)", link, sign: "Het team van Caftan Factory Group" })
              : ctaEmail({ lang, banner: "CAFTAN FACTORY", title: "🙏 Merci pour tout", hi: `Bonjour ${prenom || ""},`.replace("Bonjour ,", "Bonjour,"), lead: "Ton contrat touche bientôt à sa fin. On aimerait beaucoup avoir ton ressenti sincère — sur ta formation, tes collègues, ton travail, ton salaire et tes horaires. Et surtout : nous dire si on peut encore compter sur toi à l'avenir.", cta: "Donner mon avis (2 min)", link, sign: "L'équipe Caftan Factory Group" });
          const r = await sendAppMail({ to: e.email, toName: e.full_name ?? undefined, subject: lang === "nl" ? "Bedankt voor alles — jouw mening telt 🙏" : "Merci pour tout — ton avis compte 🙏", body: mail.body, htmlBody: mail.htmlBody, automated: true, source: "training_exit_survey", employeeId: enr.employee_id });
          if (!r || (r as { ok?: boolean }).ok !== false) {
            await admin.from("training_enrollments").update({ exit_survey_sent_at: new Date().toISOString() }).eq("employee_id", enr.employee_id);
            res.exit += 1;
          }
          continue; // pas de pouls le même jour
        }
      }

      // 2) PRISE DE POULS — contrats < 3 mois, tous les 15 j, hors fenêtre de sortie.
      const short = !!e.end_date && daysBetween(e.start_date || enr.started_on, e.end_date) <= 92;
      const inExitWindow = !!e.end_date && t >= addDaysISO(e.end_date, -15);
      if (short && !inExitWindow) {
        const dStart = daysBetween(e.start_date || enr.started_on, t);
        const dLast = enr.last_sentiment_at ? daysBetween(enr.last_sentiment_at, t) : 999;
        if (dStart >= 15 && dLast >= 15) {
          const token = crypto.randomBytes(20).toString("base64url");
          await admin.from("training_sentiment").insert({ employee_id: enr.employee_id, token, asked_at: new Date().toISOString() });
          const link = `${base}/pouls/${token}`;
          const mail =
            lang === "nl"
              ? ctaEmail({ lang, banner: "CAFTAN FACTORY", title: "💬 Hoe gaat het?", hi: `Hallo ${prenom || "collega"},`, lead: "Een korte vraag: hoe voel je je de laatste weken op het werk? Jouw mening helpt ons om alles beter te maken.", cta: "In 30 seconden antwoorden", link, sign: "Het team van Caftan Factory Group" })
              : ctaEmail({ lang, banner: "CAFTAN FACTORY", title: "💬 Comment ça va ?", hi: `Bonjour ${prenom || ""},`.replace("Bonjour ,", "Bonjour,"), lead: "Une petite question : comment te sens-tu au travail ces dernières semaines ? Ton ressenti nous aide à améliorer les choses.", cta: "Répondre en 30 secondes", link, sign: "L'équipe Caftan Factory Group" });
          const r = await sendAppMail({ to: e.email, toName: e.full_name ?? undefined, subject: lang === "nl" ? "Hoe gaat het op het werk? 💬" : "Comment ça va au travail ? 💬", body: mail.body, htmlBody: mail.htmlBody, automated: true, source: "training_sentiment", employeeId: enr.employee_id });
          if (!r || (r as { ok?: boolean }).ok !== false) {
            await admin.from("training_enrollments").update({ last_sentiment_at: new Date().toISOString() }).eq("employee_id", enr.employee_id);
            res.pouls += 1;
          }
        }
      }
    } catch (err) {
      res.errors.push(`${enr.employee_id}: ${(err as Error).message}`);
    }
  }
  return res;
}
