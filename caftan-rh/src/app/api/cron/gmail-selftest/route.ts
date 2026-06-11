// GET /api/cron/gmail-selftest — Karim 2026-06-11.
//
// Verifie que le "Gmail app password" (GMAIL_USER / GMAIL_APP_PASSWORD, env
// Vercel) fonctionne, en envoyant un VRAI mail de test a l'admin via Gmail SMTP.
//   - succes -> le mail arrive = la preuve. Retourne ok:true.
//   - echec  -> notif + push a l'admin avec l'erreur (pour etre prevenu meme
//               si le mail ne part pas).
//
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NOTIFY_TO = "elbazikarim@gmail.com";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const result: { ok: boolean; gmail_configured: boolean; sent: boolean; to: string; error: string | null; messageId?: string } = {
    ok: false,
    gmail_configured: !!(user && pass),
    sent: false,
    to: NOTIFY_TO,
    error: null,
  };

  if (!user || !pass) {
    result.error = "GMAIL_USER / GMAIL_APP_PASSWORD absents de l'environnement Vercel.";
  } else {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
      });
      const now = new Date().toLocaleString("fr-BE", { timeZone: "Europe/Brussels" });
      const info = await transporter.sendMail({
        from: `"Caftan HR" <${user}>`,
        to: NOTIFY_TO,
        subject: "✅ Gmail app password — vérification OK (Caftan HR)",
        html: `<div style="font-family:sans-serif">
          <h2 style="color:#22a559">✅ Le mot de passe d'application Gmail fonctionne</h2>
          <p>Ce mail est arrivé sur <b>${NOTIFY_TO}</b> via Gmail SMTP — donc Caftan HR peut t'envoyer des e-mails ici.</p>
          <p style="color:#888;font-size:12px">Vérification automatique du ${now}.</p>
        </div>`,
      });
      result.ok = true;
      result.sent = true;
      result.messageId = info.messageId;
    } catch (e) {
      result.error = (e as Error).message;
    }
  }

  // Echec -> prevenir l'admin via notif + push (le mail n'a pas pu partir).
  if (!result.ok) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = createAdminClient();
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
      const title = "❌ Gmail app password — vérification ÉCHOUÉE";
      const body = `Le test d'envoi Gmail a échoué : ${result.error ?? "raison inconnue"}. Les mails vers Gmail ne partiront pas tant que ce n'est pas corrigé.`;
      const { sendPushToProfile } = await import("@/lib/push-notify");
      for (const rid of adminIds) {
        const { data: ins } = await admin
          .from("notifications")
          .insert({ recipient_id: rid, kind: "gmail_selftest", title, body, data: { result } })
          .select("id").single();
        if (!ins) continue;
        const link = `/me/notifications/${(ins as { id: string }).id}`;
        await admin.from("notifications").update({ link }).eq("id", (ins as { id: string }).id);
        try { await sendPushToProfile(rid, { title, body, link, priority: "urgent", tag: "gmail-selftest" }); } catch { /* best-effort */ }
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json(result);
}
