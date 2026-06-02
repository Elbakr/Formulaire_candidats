// Karim 2026-06-02 : cron quotidien - relance signature pour contracts +
// ruptures amiables qui n'ont pas ete signes apres J+2 / J+5 / J+7.
// Auto-cancel apres J+30.
//
// Bearer auth via CRON_SECRET (Vercel Cron Scheduler).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

async function sendReminderMail(to: string, name: string, kind: "contract" | "termination", days: number, link: string) {
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) return false;

  const docLabel = kind === "contract" ? "contrat de travail" : "convention de cessation";
  const urgency = days >= 7 ? "DERNIER RAPPEL" : days >= 5 ? "RAPPEL" : "Rappel";
  const subject = `${urgency} — Signature de ton ${docLabel} en attente`;
  const firstName = name.split(/\s+/)[0] ?? name;
  const body = `Bonjour ${firstName},

Cela fait ${days} jours qu'un ${docLabel} t'a été transmis pour signature et il n'a pas encore été signé.

Merci de cliquer sur le lien ci-dessous pour signer électroniquement :
${link}

La signature électronique est conforme eIDAS UE 910/2014 (même valeur qu'une signature manuscrite).

Si tu rencontres un souci, réponds à ce mail.

L'équipe Caftan Factory (By AMD Megastore)`;

  const params = {
    to_email: to, email: to, user_email: to, candidate_email: to,
    to, to_name: name, name, candidate_name: name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, content: body, html: body.replace(/\n/g, "<br>"),
  };
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Auth Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const REMINDER_DAYS = [2, 5, 7];
  const CANCEL_AFTER = 30;
  const out = { contracts_reminded: 0, terminations_reminded: 0, cancelled: 0, errors: [] as string[] };

  // === RUPTURES AMIABLES ===
  const { data: terms } = await admin
    .from("contract_terminations")
    .select("id, status, sent_for_signature_at, employee_id, docuseal_submission_id")
    .eq("status", "sent_for_signature")
    .not("sent_for_signature_at", "is", null);

  for (const t of (terms ?? []) as Array<{ id: string; sent_for_signature_at: string; employee_id: string; docuseal_submission_id: string | null }>) {
    const days = daysSince(t.sent_for_signature_at);
    if (days >= CANCEL_AFTER) {
      await admin.from("contract_terminations").update({ status: "cancelled", refusal_reason: `Auto-cancel J+${CANCEL_AFTER} sans signature` }).eq("id", t.id);
      out.cancelled++;
      continue;
    }
    if (!REMINDER_DAYS.includes(days)) continue;

    // Charge employee + reconstruit signing URL via DocuSeal API
    const { data: emp } = await admin.from("employees").select("full_name, email").eq("id", t.employee_id).maybeSingle();
    if (!emp?.email) continue;

    let signingUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/me/termination`;
    if (t.docuseal_submission_id) {
      try {
        const r = await fetch(`${process.env.DOCUSEAL_BASE_URL}/submissions/${t.docuseal_submission_id}`, {
          headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY ?? "" },
        });
        if (r.ok) {
          const d = await r.json() as { submitters?: Array<{ role: string; embed_src?: string; status: string }> };
          const empSubmitter = d.submitters?.find((s) => s.role === "Employee" && s.status !== "completed");
          if (empSubmitter?.embed_src) signingUrl = empSubmitter.embed_src;
        }
      } catch { /* ignore */ }
    }

    const ok = await sendReminderMail(emp.email, emp.full_name ?? "Travailleur", "termination", days, signingUrl);
    if (ok) out.terminations_reminded++;
    else out.errors.push(`mail KO ${t.id}`);
  }

  // === CONTRATS ===
  try {
    const { data: contracts } = await admin
      .from("employee_contracts")
      .select("id, employee_id, sent_at, docuseal_submission_id, docuseal_status")
      .is("signed_at", null)
      .not("sent_at", "is", null)
      .not("docuseal_submission_id", "is", null);

    for (const ct of (contracts ?? []) as Array<{ id: string; employee_id: string; sent_at: string; docuseal_submission_id: string | null; docuseal_status: string | null }>) {
      if (ct.docuseal_status === "declined") continue;
      const days = daysSince(ct.sent_at);
      if (days >= CANCEL_AFTER) {
        await admin.from("employee_contracts").update({ docuseal_status: "cancelled" }).eq("id", ct.id);
        out.cancelled++;
        continue;
      }
      if (!REMINDER_DAYS.includes(days)) continue;
      const { data: emp } = await admin.from("employees").select("full_name, email").eq("id", ct.employee_id).maybeSingle();
      if (!emp?.email) continue;

      let signingUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/me/documents`;
      if (ct.docuseal_submission_id) {
        try {
          const r = await fetch(`${process.env.DOCUSEAL_BASE_URL}/submissions/${ct.docuseal_submission_id}`, {
            headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY ?? "" },
          });
          if (r.ok) {
            const d = await r.json() as { submitters?: Array<{ role: string; embed_src?: string; status: string }> };
            const empSubmitter = d.submitters?.find((s) => s.role === "Employee" && s.status !== "completed");
            if (empSubmitter?.embed_src) signingUrl = empSubmitter.embed_src;
          }
        } catch { /* ignore */ }
      }
      const ok = await sendReminderMail(emp.email, emp.full_name ?? "Travailleur", "contract", days, signingUrl);
      if (ok) out.contracts_reminded++;
      else out.errors.push(`mail KO ${ct.id}`);
    }
  } catch (e) {
    out.errors.push(`contracts query: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, ...out });
}
