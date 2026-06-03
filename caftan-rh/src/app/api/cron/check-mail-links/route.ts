// Karim 2026-06-03 : cron qui teste les liens dans les mails envoyés
// récemment. Si un lien est cassé → crée une notification urgente pour
// les admin/rh + log dans table dédiée.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AttachmentLink { name: string; url: string }

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; error?: string }> {
  // Karim 2026-06-03 : skip les magic links Supabase Auth (rejected HEAD,
  // ils sont auto-expirés 1h donc forcément KO après peu de temps).
  if (url.includes("/auth/v1/verify")) {
    return { ok: true, status: 200 }; // skip - magic link expire vite par design
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    // Si 405 (Method Not Allowed sur HEAD), retry GET
    if (r.status === 405) {
      const ctl2 = new AbortController();
      const t2 = setTimeout(() => ctl2.abort(), 10000);
      r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl2.signal });
      clearTimeout(t2);
    }
    clearTimeout(t);
    return { ok: r.status >= 200 && r.status < 400, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // Récup les mails envoyés dans les 7 derniers jours avec attachments
  const { data: mails } = await admin
    .from("outbound_mails")
    .select("id, recipient_email, subject, sent_at, attachments, employee_id, source")
    .gte("sent_at", sevenDaysAgo)
    .not("attachments", "is", null)
    .limit(200);

  let totalChecked = 0;
  let totalBroken = 0;
  const broken: Array<{
    mailId: string;
    subject: string;
    recipient: string;
    sentAt: string;
    employeeId: string | null;
    attachmentName: string;
    url: string;
    status: number;
    error?: string;
  }> = [];

  for (const m of (mails ?? [])) {
    const atts = (m.attachments ?? []) as AttachmentLink[];
    for (const a of atts) {
      if (!a.url || !a.url.startsWith("http")) continue;
      totalChecked++;
      const r = await checkUrl(a.url);
      if (!r.ok) {
        totalBroken++;
        broken.push({
          mailId: m.id,
          subject: m.subject,
          recipient: m.recipient_email,
          sentAt: m.sent_at,
          employeeId: m.employee_id,
          attachmentName: a.name,
          url: a.url,
          status: r.status,
          error: r.error,
        });
      }
    }
  }

  // Si des liens cassés détectés, notifications urgentes pour les admin/RH
  if (broken.length > 0) {
    const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
    if (hrIds.length > 0) {
      const inserts = hrIds.flatMap((hrId) =>
        broken.slice(0, 5).map((b) => ({
          recipient_id: hrId,
          kind: "broken_mail_link",
          title: `⚠️ Lien mail cassé : ${b.recipient}`,
          body: `Le lien vers "${b.attachmentName}" envoyé à ${b.recipient} le ${new Date(b.sentAt).toLocaleDateString("fr-BE")} ne fonctionne plus (HTTP ${b.status}). Sujet : "${b.subject}"`,
          link: b.employeeId ? `/planning/employees/${b.employeeId}` : "/rh/mails",
          data: { mailId: b.mailId, url: b.url, status: b.status },
        })),
      );
      await admin.from("notifications").insert(inserts);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: totalChecked,
    broken: totalBroken,
    sample_broken: broken.slice(0, 5),
  });
}
